#!/usr/bin/env bash
# =============================================================
# ADS Benchmark – Script principal
# Lance chaque scénario k6 sur sql-api ET orm-api,
# collecte les métriques CPU/RAM pendant les tests,
# et sauvegarde tous les résultats dans ./results/
# =============================================================

set -euo pipefail

SQL_URL="http://localhost:3001"
ORM_URL="http://localhost:3002"
RESULTS_DIR="$(dirname "$0")/../results"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RUN_DIR="${RESULTS_DIR}/run_${TIMESTAMP}"

mkdir -p "$RUN_DIR"

echo "=================================================="
echo " ADS ORM Benchmark – Run ${TIMESTAMP}"
echo "=================================================="

# ---- helpers ----

check_api() {
  local url=$1 name=$2
  echo -n "Checking ${name} at ${url}/health ... "
  if curl -sf "${url}/health" > /dev/null; then
    echo "OK"
  else
    echo "FAIL – is the API running?"
    exit 1
  fi
}

run_scenario() {
  local scenario_file=$1
  local base_url=$2
  local impl_name=$3
  local scenario_name
  scenario_name=$(basename "$scenario_file" .js)

  local out_json="${RUN_DIR}/${scenario_name}_${impl_name}.json"
  local out_log="${RUN_DIR}/${scenario_name}_${impl_name}.log"
  local metrics_csv="${RUN_DIR}/${scenario_name}_${impl_name}_docker_stats.csv"

  echo ""
  echo ">>> Scenario: ${scenario_name} | Implementation: ${impl_name}"
  echo "    Output: ${out_json}"

  # Start collecting docker stats in the background
  collect_docker_stats "$metrics_csv" &
  local stats_pid=$!

  # Run k6
  k6 run \
    --env BASE_URL="${base_url}" \
    --out "json=${out_json}" \
    --summary-export "${out_json%.json}_summary.json" \
    "$scenario_file" 2>&1 | tee "$out_log"

  # Stop docker stats collection
  kill "$stats_pid" 2>/dev/null || true

  echo "    Done."
}

collect_docker_stats() {
  local output_file=$1
  echo "timestamp,container,cpu_pct,mem_usage,mem_pct" > "$output_file"

  while true; do
    docker stats --no-stream --format \
      "{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}}" \
      ads_sql_api ads_orm_api ads_postgres 2>/dev/null \
    | while IFS= read -r line; do
        echo "$(date +%s),${line}"
      done >> "$output_file"
    sleep 2
  done
}

count_loc() {
  echo ""
  echo "=== Lines of Code (LOC) ==="
  echo "sql-api:"
  find "$(dirname "$0")/../sql-api/src" -name "*.js" | xargs wc -l 2>/dev/null | tail -1
  echo "orm-api:"
  find "$(dirname "$0")/../orm-api/src" -name "*.js" | xargs wc -l 2>/dev/null | tail -1
  echo "orm-api schema.prisma:"
  wc -l "$(dirname "$0")/../orm-api/prisma/schema.prisma" 2>/dev/null || echo "0"
}

# ---- main ----

check_api "$SQL_URL" "sql-api"
check_api "$ORM_URL" "orm-api"

SCENARIOS=(
  "$(dirname "$0")/../k6/scenarios/01-smoke.js"
  "$(dirname "$0")/../k6/scenarios/02-crud.js"
  "$(dirname "$0")/../k6/scenarios/03-read-heavy.js"
  "$(dirname "$0")/../k6/scenarios/04-complex-queries.js"
  "$(dirname "$0")/../k6/scenarios/05-stress.js"
)

# Run only scenarios passed as arguments, or all if none
if [ $# -gt 0 ]; then
  SCENARIOS=("$@")
fi

for scenario in "${SCENARIOS[@]}"; do
  run_scenario "$scenario" "$SQL_URL" "sql"
  echo "  Cooling down 15s..."
  sleep 15
  run_scenario "$scenario" "$ORM_URL" "orm"
  echo "  Cooling down 30s..."
  sleep 30
done

count_loc | tee "${RUN_DIR}/loc_report.txt"

echo ""
echo "=================================================="
echo " All results saved in: ${RUN_DIR}"
echo "=================================================="
echo " Next step: run scripts/analyze-results.sh ${RUN_DIR}"
