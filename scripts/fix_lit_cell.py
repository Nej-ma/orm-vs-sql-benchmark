"""Fix cell 18: re-insert yusmita data + normalise before the chart code."""
import json

with open("analysis.ipynb", encoding="utf-8") as f:
    nb = json.load(f)

FULL_LIT_CELL = """\
# Yusmita et al. (2025) — Table 2, execution time (ms), averaged over 100 runs
yusmita = {
    "find_all":      {"sql": 7.85,  "orm": 49.65},
    "find_one":      {"sql": 6.59,  "orm": 52.82},
    "nested_find":   {"sql": 10.96, "orm": 65.01},
    "create":        {"sql": 8.49,  "orm": 50.57},
    "nested_create": {"sql": 12.00, "orm": 59.39},
    "update":        {"sql": 7.66,  "orm": 48.62},
    "nested_update": {"sql": 11.52, "orm": 59.77},
    "delete":        {"sql": 12.56, "orm": 56.57},
}

def normalise(d):
    \"\"\"Normalise to impl -> op -> scalar regardless of input layout.\"\"\"
    result = {"sql": {}, "orm": {}}
    for impl in ("sql", "orm"):
        for op in OPS_ORDER:
            v = d.get(impl, {}).get(op) or d.get(op, {}).get(impl)
            result[impl][op] = v["avg"] if isinstance(v, dict) else (v or 0)
    return result

micro_n   = normalise(micro)
yusmita_n = normalise(yusmita)

# ── Figure ────────────────────────────────────────────────────────────────────
fig, axes = plt.subplots(1, 2, figsize=(13, 5))

titles   = [
    "This study (HTTP round-trip, 1 VU, avg ms)",
    "Yusmita et al. 2025 (process-level, 100 runs, avg ms)",
]
datasets = [micro_n, yusmita_n]

for ax, data, title in zip(axes, datasets, titles):
    xm = np.arange(len(OPS_ORDER))
    for i, impl in enumerate(["sql", "orm"]):
        vals = [data[impl][op] for op in OPS_ORDER]
        bars = ax.bar(xm + i*W - W/2, vals, width=W,
                      label="SQL natif" if impl == "sql" else "Prisma ORM",
                      color=COLORS[impl], alpha=BAR_ALPHA, zorder=3)
        label_bars(ax, bars, fmt="{:.1f}", unit=" ms", fontsize=7)
    ax.set_xticks(xm)
    ax.set_xticklabels([op.replace("_", "\\n") for op in OPS_ORDER])
    ax.set_ylabel("Avg execution time (ms)")
    ax.set_title(title)
    ax.legend()

plt.suptitle("Comparison with Yusmita et al. (2025) — sequential execution, 8 operation types",
             y=1.02, fontsize=10)
plt.tight_layout()
plt.savefig(RUN_DIR / "chart_literature_comparison.png", dpi=150, bbox_inches="tight")
plt.show()

print("\\n=== ORM/SQL ratio comparison ===")
print(f"{'Operation':<20} {'Yusmita et al.':>15} {'This study':>12}")
print("-" * 50)
for op in OPS_ORDER:
    y_ratio = yusmita_n["orm"][op] / yusmita_n["sql"][op]
    m_ratio = micro_n["orm"][op] / micro_n["sql"][op] if micro_n["sql"][op] else 0
    print(f"{op:<20} {y_ratio:>10.1f}x    {m_ratio:>8.1f}x")
"""

nb["cells"][18]["source"] = FULL_LIT_CELL
nb["cells"][18]["outputs"] = []
nb["cells"][18]["execution_count"] = None

with open("analysis.ipynb", "w", encoding="utf-8") as f:
    json.dump(nb, f, ensure_ascii=False, indent=1)

print("Fixed cell 18")
