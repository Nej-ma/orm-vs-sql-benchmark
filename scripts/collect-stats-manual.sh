#!/usr/bin/env bash
# =============================================================
# Collecte manuelle des stats CPU/RAM via docker stats
# Utile pour lancer en parallèle d'un test k6 manuel.
# Usage : ./collect-stats-manual.sh [output.csv] [interval_sec]
# =============================================================

OUTPUT="${1:-./results/manual_stats.csv}"
INTERVAL="${2:-2}"

mkdir -p "$(dirname "$OUTPUT")"
echo "timestamp,container,cpu_pct,mem_usage,mem_limit,mem_pct,net_io,block_io" > "$OUTPUT"
echo "Collecting docker stats → ${OUTPUT} (Ctrl+C to stop)"

while true; do
  docker stats --no-stream --format \
    "{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}},{{.NetIO}},{{.BlockIO}}" \
    ads_sql_api ads_orm_api ads_postgres 2>/dev/null \
  | while IFS= read -r line; do
      echo "$(date +%s),${line}"
    done >> "$OUTPUT"
  sleep "$INTERVAL"
done
