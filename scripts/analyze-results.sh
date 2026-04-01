#!/usr/bin/env bash
# =============================================================
# ADS Benchmark – Analyse des résultats
# Lit les fichiers *_summary.json produits par k6 et génère
# un tableau comparatif CSV + un résumé lisible.
# Usage : ./analyze-results.sh ./results/run_20250101_120000
# =============================================================

set -euo pipefail

RUN_DIR="${1:-}"
if [ -z "$RUN_DIR" ] || [ ! -d "$RUN_DIR" ]; then
  echo "Usage: $0 <run_directory>"
  echo "Example: $0 ./results/run_20250101_120000"
  exit 1
fi

OUTPUT_CSV="${RUN_DIR}/comparison.csv"
OUTPUT_TXT="${RUN_DIR}/comparison_report.txt"

echo "Scenario,Implementation,Avg(ms),Med(ms),P90(ms),P95(ms),P99(ms),Max(ms),ReqTotal,ErrorRate(%),Throughput(req/s)" > "$OUTPUT_CSV"

process_summary() {
  local file=$1
  local scenario impl

  # Extract scenario and implementation from filename
  # e.g. 02-crud_sql_summary.json
  local basename
  basename=$(basename "$file" _summary.json)
  scenario=$(echo "$basename" | sed 's/_\(sql\|orm\)$//')
  impl=$(echo "$basename" | grep -o '\(sql\|orm\)$')

  # Parse JSON with node (available everywhere)
  node - "$file" "$scenario" "$impl" << 'EOF'
const fs   = require("fs");
const file = process.argv[2];
const scen = process.argv[3];
const impl = process.argv[4];

let data;
try { data = JSON.parse(fs.readFileSync(file, "utf8")); }
catch(e) { process.exit(0); }

const m    = data.metrics || {};
// k6 v1.x: metrics values are flat (no .values wrapper)
const dur   = m.http_req_duration;
const fails = m.http_req_failed;
const reqs  = m.http_reqs;

if (!dur) process.exit(0);

// Support both old (.values.avg) and new flat (avg) formats
const v = (obj, key) => obj?.[key] ?? obj?.values?.[key] ?? 0;

const avg  = v(dur, "avg").toFixed(2);
const med  = v(dur, "med").toFixed(2);
const p90  = v(dur, "p(90)").toFixed(2);
const p95  = v(dur, "p(95)").toFixed(2);
const p99  = (v(dur, "p(99)") || v(dur, "p(95)")).toFixed(2);  // fallback to p95 if p99 absent
const max  = v(dur, "max").toFixed(2);

const totalReqs  = v(reqs, "count") || 0;
const errorRate  = fails ? ((fails.value ?? v(fails, "rate") ?? 0) * 100).toFixed(2) : "0.00";
const throughput = reqs  ? v(reqs, "rate").toFixed(2) : "0.00";

console.log(`${scen},${impl},${avg},${med},${p90},${p95},${p99},${max},${totalReqs},${errorRate},${throughput}`);
EOF
}

echo "Analyzing results in: $RUN_DIR"
echo ""

for summary_file in "$RUN_DIR"/*_summary.json; do
  [ -f "$summary_file" ] || continue
  process_summary "$summary_file" >> "$OUTPUT_CSV"
done

# Generate human-readable report
{
  echo "========================================================"
  echo " ADS Benchmark – Rapport de comparaison"
  echo " Run: $(basename "$RUN_DIR")"
  echo "========================================================"
  echo ""

  # Print CSV as table
  node - "$OUTPUT_CSV" << 'EOF'
const fs   = require("fs");
const lines = fs.readFileSync(process.argv[2], "utf8").trim().split("\n");
const header = lines[0].split(",");
const rows   = lines.slice(1).map(l => l.split(","));

// Group by scenario
const byScen = {};
for (const row of rows) {
  const key = row[0];
  if (!byScen[key]) byScen[key] = [];
  byScen[key].push(row);
}

for (const [scenario, impls] of Object.entries(byScen)) {
  console.log(`\n── ${scenario} ──`);
  console.log(header.join(" | "));
  console.log(header.map(h => "-".repeat(h.length)).join("-+-"));
  for (const row of impls) {
    console.log(row.join(" | "));
  }

  // Delta
  const sql = impls.find(r => r[1] === "sql");
  const orm = impls.find(r => r[1] === "orm");
  if (sql && orm) {
    const p95sql = parseFloat(sql[5]);
    const p95orm = parseFloat(orm[5]);
    const delta  = ((p95orm - p95sql) / p95sql * 100).toFixed(1);
    const sign   = delta > 0 ? "+" : "";
    const verdict = delta > 20 ? "⚠ ORM exceeds threshold" : delta > 0 ? "ORM slower (within threshold)" : "✓ ORM faster";
    console.log(`  → P95 ORM vs SQL: ${sign}${delta}% — ${verdict}`);
  }
}
EOF

} | tee "$OUTPUT_TXT"

echo ""
echo "CSV  → ${OUTPUT_CSV}"
echo "TXT  → ${OUTPUT_TXT}"
