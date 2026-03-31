#!/usr/bin/env bash
# =============================================================
# ADS Benchmark – Script principal
#
# Lance chaque scénario k6 sur sql-api ET orm-api via Docker,
# collecte les métriques CPU/RAM, et sauvegarde tout dans results/.
#
# Usage :
#   bash scripts/run-benchmark.sh              # tous les scénarios
#   bash scripts/run-benchmark.sh 02 04        # scénarios 02 et 04 seulement
# =============================================================

set -euo pipefail

# Prevent Git Bash on Windows from converting /scripts/ paths to Windows paths
export MSYS_NO_PATHCONV=1

# URLs internes au réseau Docker (noms de services docker-compose)
SQL_URL="http://sql-api:3001"
ORM_URL="http://orm-api:3002"

# URLs host pour les health checks (depuis la machine hôte)
SQL_HOST_URL="http://localhost:3001"
ORM_HOST_URL="http://localhost:3002"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
RESULTS_DIR="${ROOT_DIR}/results"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RUN_DIR="${RESULTS_DIR}/run_${TIMESTAMP}"

mkdir -p "$RUN_DIR"

echo "=================================================="
echo " ADS ORM Benchmark – Run ${TIMESTAMP}"
echo "=================================================="

# ---- helpers ----

check_api() {
  local url=$1 name=$2
  echo -n "  Checking ${name} at ${url}/health ... "
  if curl -sf "${url}/health" > /dev/null 2>&1; then
    echo "OK"
  else
    echo "FAIL"
    echo "  Is the stack running? Try: docker compose up -d"
    exit 1
  fi
}

run_scenario() {
  local scenario_num=$1
  local scenario_file
  scenario_file=$(find "${ROOT_DIR}/k6/scenarios" -name "${scenario_num}-*.js" | head -1)

  if [ -z "$scenario_file" ]; then
    echo "  WARNING: no scenario matching '${scenario_num}-*.js', skipping."
    return
  fi

  local scenario_name
  scenario_name=$(basename "$scenario_file" .js)

  for impl in "sql" "orm"; do
    local base_url stats_container
    if [ "$impl" = "sql" ]; then
      base_url="$SQL_URL"
      stats_container="ads_sql_api"
    else
      base_url="$ORM_URL"
      stats_container="ads_orm_api"
    fi

    local out_json="${RUN_DIR}/${scenario_name}_${impl}.json"
    local summary_json="${RUN_DIR}/${scenario_name}_${impl}_summary.json"
    local out_log="${RUN_DIR}/${scenario_name}_${impl}.log"
    local stats_csv="${RUN_DIR}/${scenario_name}_${impl}_docker_stats.csv"

    echo ""
    echo ">>> Scenario: ${scenario_name} | Implementation: ${impl}"

    # Collect docker stats in background
    collect_docker_stats "$stats_csv" "$stats_container" &
    local stats_pid=$!

    # Run k6 inside Docker on the same network
    # Use // prefix to prevent Git Bash path conversion on Windows
    local k6_scenario="//scripts/scenarios/$(basename "$scenario_file")"
    local k6_out="//results/$(basename "$out_json")"
    local k6_summary="//results/$(basename "$summary_json")"

    docker compose -f "${ROOT_DIR}/docker-compose.yml" run --rm \
      --no-deps \
      k6 run \
        --env "BASE_URL=${base_url}" \
        --out "json=${k6_out}" \
        --summary-export "${k6_summary}" \
        "${k6_scenario}" \
      2>&1 | tee "$out_log"

    kill "$stats_pid" 2>/dev/null || true

    if [ "$impl" = "sql" ]; then
      echo "  Cooling down 15 s..."
      sleep 15
    else
      echo "  Cooling down 30 s..."
      sleep 30
    fi
  done
}

collect_docker_stats() {
  local output_file=$1
  local target_container=$2
  echo "timestamp,container,cpu_pct,mem_usage,mem_pct" > "$output_file"
  while true; do
    docker stats --no-stream --format \
      "{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}}" \
      "$target_container" ads_postgres 2>/dev/null \
    | while IFS= read -r line; do
        echo "$(date +%s),${line}"
      done >> "$output_file"
    sleep 2
  done
}

count_loc() {
  {
    echo ""
    echo "=== Lines of Code ==="
    echo "sql-api (src/):"
    find "${ROOT_DIR}/sql-api/src" -name "*.js" -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print "  "$1" lines"}'
    echo "orm-api (src/):"
    find "${ROOT_DIR}/orm-api/src" -name "*.js" -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print "  "$1" lines"}'
    echo "orm-api (schema.prisma):"
    wc -l "${ROOT_DIR}/orm-api/prisma/schema.prisma" 2>/dev/null | awk '{print "  "$1" lines"}'
  } | tee "${RUN_DIR}/loc_report.txt"
}

# ---- main ----

echo ""
echo "Checking APIs..."
check_api "$SQL_HOST_URL" "sql-api"
check_api "$ORM_HOST_URL" "orm-api"

# Determine which scenarios to run
ALL_SCENARIOS=("01" "02" "03" "04" "05")
if [ $# -gt 0 ]; then
  SCENARIOS=("$@")
else
  SCENARIOS=("${ALL_SCENARIOS[@]}")
fi

echo ""
echo "Running scenarios: ${SCENARIOS[*]}"

for num in "${SCENARIOS[@]}"; do
  run_scenario "$num"
done

count_loc

echo ""
echo "=================================================="
echo " All results saved in: ${RUN_DIR}"
echo "=================================================="
echo " Analyze: bash scripts/analyze-results.sh ${RUN_DIR}"
