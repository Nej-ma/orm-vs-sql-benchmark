"""Restyle all chart cells in analysis.ipynb with an academic, sober visual identity."""
import json, re

NB = "analysis.ipynb"

# ── Shared style constants injected into every chart cell ───────────────────
STYLE_HEADER = """\
# ── shared style (do not edit here — set in cell 1) ────────────────────────
"""

# ── New Setup cell source ────────────────────────────────────────────────────
SETUP = """\
import json
import os
import glob
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
from pathlib import Path

# ── Paths ────────────────────────────────────────────────────────────────────
RUN_DIR      = Path("results/run_20260331_115700")
RESULTS_DIR  = Path("results")

# ── Visual identity (academic palette) ───────────────────────────────────────
COLORS = {"sql": "#2C5F8A", "orm": "#888888"}   # steel-blue / medium-grey
BAR_ALPHA  = 0.85
W          = 0.35        # bar width

SCENARIO_LABELS = {
    "01-smoke":           "Smoke\\n(1 VU)",
    "02-crud":            "CRUD\\n(50 VUs)",
    "03-read-heavy":      "Read-heavy\\n(100 VUs)",
    "04-complex-queries": "Complex queries\\n(50 VUs)",
    "05-stress":          "Stress\\n(200 VUs)",
}

THRESHOLD_PCT = 20

# ── Matplotlib defaults ───────────────────────────────────────────────────────
plt.rcParams.update({
    "figure.dpi":         130,
    "figure.facecolor":   "white",
    "axes.facecolor":     "white",
    "axes.spines.top":    False,
    "axes.spines.right":  False,
    "axes.spines.left":   True,
    "axes.spines.bottom": True,
    "axes.linewidth":     0.8,
    "axes.grid":          True,
    "axes.grid.axis":     "y",
    "grid.color":         "#DDDDDD",
    "grid.linewidth":     0.6,
    "font.family":        "sans-serif",
    "font.size":          9,
    "axes.titlesize":     10,
    "axes.labelsize":     9,
    "legend.fontsize":    8,
    "legend.frameon":     False,
    "xtick.labelsize":    8,
    "ytick.labelsize":    8,
})

def label_bars(ax, bars, fmt="{:.0f}", unit="", offset_frac=0.03, fontsize=7.5):
    \"\"\"Add value labels above bars, scaled relative to y-axis range.\"\"\"
    ylim = ax.get_ylim()
    offset = (ylim[1] - ylim[0]) * offset_frac
    for bar in bars:
        h = bar.get_height()
        if h > 0:
            ax.text(
                bar.get_x() + bar.get_width() / 2,
                h + offset,
                fmt.format(h) + unit,
                ha="center", va="bottom", fontsize=fontsize,
            )

print("Setup OK")
"""

# ── Chart 1: P95 Latency ─────────────────────────────────────────────────────
CHART_P95 = """\
scenarios = list(SCENARIO_LABELS.keys())
x = np.arange(len(scenarios))

fig, ax = plt.subplots(figsize=(10, 4.5))
for i, impl in enumerate(["sql", "orm"]):
    sub  = df[df.impl == impl].set_index("scenario")
    vals = [sub.loc[s, "p95_ms"] if s in sub.index else 0 for s in scenarios]
    bars = ax.bar(x + i*W - W/2, vals, width=W,
                  label="SQL natif" if impl == "sql" else "Prisma ORM",
                  color=COLORS[impl], alpha=BAR_ALPHA, zorder=3)
    label_bars(ax, bars, fmt="{:.0f}", unit=" ms")

ax.set_xticks(x)
ax.set_xticklabels([SCENARIO_LABELS[s] for s in scenarios])
ax.set_yscale("log")
ax.set_ylabel("P95 latency (ms, log scale)")
ax.set_title("P95 request latency by scenario")
ax.legend()
plt.tight_layout()
plt.savefig(RUN_DIR / "chart_p95_overall.png", dpi=150, bbox_inches="tight")
plt.show()
"""

# ── Chart 2: ORM Overhead % ──────────────────────────────────────────────────
CHART_OVERHEAD = """\
pivot = df.pivot(index="scenario", columns="impl", values="p95_ms").reindex(scenarios)
pivot["delta_pct"] = (pivot["orm"] - pivot["sql"]) / pivot["sql"] * 100

bar_colors = [
    "#C0392B" if v > THRESHOLD_PCT else ("#2C5F8A" if v < 0 else "#888888")
    for v in pivot["delta_pct"]
]

fig, ax = plt.subplots(figsize=(9, 4))
bars = ax.bar(
    [SCENARIO_LABELS[s] for s in scenarios],
    pivot["delta_pct"],
    color=bar_colors, alpha=BAR_ALPHA, zorder=3,
)
for bar, v in zip(bars, pivot["delta_pct"]):
    va, off = ("bottom", 1.5) if v >= 0 else ("top", -1.5)
    ax.text(bar.get_x() + bar.get_width() / 2, v + off,
            f"{v:+.1f}%", ha="center", va=va, fontsize=8)

ax.axhline(THRESHOLD_PCT, color="#C0392B", linestyle="--", linewidth=1, label="20% threshold")
ax.axhline(0, color="#333333", linewidth=0.8)
patches = [
    mpatches.Patch(color="#C0392B", label="ORM overhead > 20%"),
    mpatches.Patch(color="#888888", label="ORM overhead within threshold"),
    mpatches.Patch(color="#2C5F8A", label="ORM faster than SQL natif"),
]
ax.legend(handles=patches)
ax.set_ylabel("Prisma ORM overhead vs SQL natif (%)")
ax.set_title("ORM overhead relative to SQL natif — P95 latency")
plt.tight_layout()
plt.savefig(RUN_DIR / "chart_overhead_pct.png", dpi=150, bbox_inches="tight")
plt.show()
"""

# ── Chart 3: Throughput ──────────────────────────────────────────────────────
CHART_THROUGHPUT = """\
fig, ax = plt.subplots(figsize=(10, 4))
for i, impl in enumerate(["sql", "orm"]):
    sub  = df[df.impl == impl].set_index("scenario")
    vals = [sub.loc[s, "throughput"] if s in sub.index else 0 for s in scenarios]
    bars = ax.bar(x + i*W - W/2, vals, width=W,
                  label="SQL natif" if impl == "sql" else "Prisma ORM",
                  color=COLORS[impl], alpha=BAR_ALPHA, zorder=3)
    label_bars(ax, bars, fmt="{:.0f}", unit=" req/s")

ax.set_xticks(x)
ax.set_xticklabels([SCENARIO_LABELS[s] for s in scenarios])
ax.set_ylabel("Throughput (req/s)")
ax.set_title("Request throughput by scenario")
ax.legend()
plt.tight_layout()
plt.savefig(RUN_DIR / "chart_throughput.png", dpi=150, bbox_inches="tight")
plt.show()
"""

# ── Chart 4: Per-operation breakdown ────────────────────────────────────────
CHART_PER_OP = """\
def extract_op_p95(metrics):
    return {
        key.split("op:")[1].rstrip("}"): val.get("p(95)", 0)
        for key, val in metrics.items()
        if key.startswith("http_req_duration{op:")
    }

fig, axes = plt.subplots(1, 2, figsize=(13, 4.5))
for ax, scenario in zip(axes, ["03-read-heavy", "04-complex-queries"]):
    op_data = {}
    for impl in ["sql", "orm"]:
        row = df[(df.scenario == scenario) & (df.impl == impl)].iloc[0]
        op_data[impl] = extract_op_p95(row["_metrics"])
    all_ops = sorted(set(list(op_data["sql"].keys()) + list(op_data["orm"].keys())))
    xo = np.arange(len(all_ops))
    for i, impl in enumerate(["sql", "orm"]):
        vals = [op_data[impl].get(op, 0) for op in all_ops]
        bars = ax.bar(xo + i*W - W/2, vals, width=W,
                      label="SQL natif" if impl == "sql" else "Prisma ORM",
                      color=COLORS[impl], alpha=BAR_ALPHA, zorder=3)
        label_bars(ax, bars, fmt="{:.0f}", unit=" ms")
    ax.set_xticks(xo)
    ax.set_xticklabels([op.replace("_", "\\n") for op in all_ops])
    ax.set_ylabel("P95 latency (ms)")
    ax.set_title(SCENARIO_LABELS[scenario].replace("\\n", " "))
    ax.legend()

plt.suptitle("P95 latency by operation type (concurrent load)", y=1.02, fontsize=10)
plt.tight_layout()
plt.savefig(RUN_DIR / "chart_per_op_breakdown.png", dpi=150, bbox_inches="tight")
plt.show()
"""

# ── Chart 5: Percentile profiles ────────────────────────────────────────────
CHART_PERCENTILES = """\
core = ["02-crud", "03-read-heavy", "04-complex-queries"]
fig, axes = plt.subplots(1, 3, figsize=(13, 4))
for ax, scenario in zip(axes, core):
    for impl in ["sql", "orm"]:
        row  = df[(df.scenario == scenario) & (df.impl == impl)].iloc[0]
        vals = [row[p] for p in ["avg_ms", "p90_ms", "p95_ms"]]
        lbl  = "SQL natif" if impl == "sql" else "Prisma ORM"
        ax.plot(["Avg", "P90", "P95"], vals, marker="o", linewidth=1.6,
                color=COLORS[impl], label=lbl)
        ax.fill_between(["Avg", "P90", "P95"], vals, alpha=0.06, color=COLORS[impl])
    ax.set_title(SCENARIO_LABELS[scenario].replace("\\n", " "))
    ax.set_ylabel("Latency (ms)")
    ax.legend()

plt.suptitle("Latency distribution (Avg, P90, P95) — core scenarios", y=1.02, fontsize=10)
plt.tight_layout()
plt.savefig(RUN_DIR / "chart_percentile_profiles.png", dpi=150, bbox_inches="tight")
plt.show()
"""

# ── Chart 6: Micro-benchmark ────────────────────────────────────────────────
CHART_MICRO = """\
xm = np.arange(len(OPS_ORDER))

fig, ax = plt.subplots(figsize=(11, 4.5))
for i, impl in enumerate(["sql", "orm"]):
    vals = [micro[impl][op]["avg"] for op in OPS_ORDER]
    bars = ax.bar(xm + i*W - W/2, vals, width=W,
                  label="SQL natif" if impl == "sql" else "Prisma ORM",
                  color=COLORS[impl], alpha=BAR_ALPHA, zorder=3)
    label_bars(ax, bars, fmt="{:.1f}", unit=" ms")

ax.set_xticks(xm)
ax.set_xticklabels([op.replace("_", "\\n") for op in OPS_ORDER])
ax.set_ylabel("Average latency (ms)")
ax.set_title("Sequential micro-benchmark — average latency by operation (1 VU, 100 iterations)")
ax.legend()
plt.tight_layout()
plt.savefig(RUN_DIR / "chart_micro_benchmark.png", dpi=150, bbox_inches="tight")
plt.show()
"""

# ── Chart 7: Literature comparison ──────────────────────────────────────────
CHART_LIT = """\
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

# ── Chart 8: LOC ────────────────────────────────────────────────────────────
CHART_LOC = """\
loc_data = {
    "Component": ["Application code\\n(src/)", "Schema /\\nDB definition", "Total"],
    "SQL natif": [397, 67, 464],
    "Prisma ORM": [338, 62, 400],
}
loc_df = pd.DataFrame(loc_data).set_index("Component")

fig, ax = plt.subplots(figsize=(7, 4))
xc = np.arange(len(loc_df))
for i, (col, impl) in enumerate([("SQL natif", "sql"), ("Prisma ORM", "orm")]):
    bars = ax.bar(xc + i*W - W/2, loc_df[col], width=W,
                  label=col, color=COLORS[impl], alpha=BAR_ALPHA, zorder=3)
    for bar, v in zip(bars, loc_df[col]):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 3,
                str(v), ha="center", va="bottom", fontsize=9)

ax.set_xticks(xc)
ax.set_xticklabels(loc_df.index)
ax.set_ylabel("Lines of code (LOC)")
ax.set_title("Code size by component")
ax.legend()
ax.set_ylim(0, 530)
plt.tight_layout()
plt.savefig(RUN_DIR / "chart_loc.png", dpi=150, bbox_inches="tight")
plt.show()
"""

# ── Chart 9: CPU & Memory ────────────────────────────────────────────────────
CHART_RESOURCES = """\
fig, axes = plt.subplots(1, 2, figsize=(12, 4.5))
xc = np.arange(len(scenarios))

for ax_idx, metric, ylabel, title in [
    (0, "cpu_avg", "Average CPU usage (%)", "CPU usage by scenario (API container)"),
    (1, "mem_avg", "Average memory (MiB)",  "Memory usage by scenario (API container)"),
]:
    ax   = axes[ax_idx]
    unit = "%" if ax_idx == 0 else " MiB"
    for i, impl in enumerate(["sql", "orm"]):
        sub  = stats_df[stats_df.impl == impl].set_index("scenario")
        vals = [sub.loc[s, metric] if s in sub.index else 0 for s in scenarios]
        bars = ax.bar(xc + i*W - W/2, vals, width=W,
                      label="SQL natif" if impl == "sql" else "Prisma ORM",
                      color=COLORS[impl], alpha=BAR_ALPHA, zorder=3)
        label_bars(ax, bars, fmt="{:.0f}", unit=unit)
    ax.set_xticks(xc)
    ax.set_xticklabels([SCENARIO_LABELS[s] for s in scenarios])
    ax.set_ylabel(ylabel)
    ax.set_title(title)
    ax.legend()

plt.suptitle("Resource consumption by scenario — API container (docker stats, 2 s interval)",
             y=1.02, fontsize=10)
plt.tight_layout()
plt.savefig(RUN_DIR / "chart_resources.png", dpi=150, bbox_inches="tight")
plt.show()

print("\\n=== ORM vs SQL natif resource overhead ===")
for scenario in scenarios:
    s_row = stats_df[(stats_df.scenario == scenario) & (stats_df.impl == "sql")]
    o_row = stats_df[(stats_df.scenario == scenario) & (stats_df.impl == "orm")]
    if s_row.empty or o_row.empty:
        continue
    sc, oc = s_row.cpu_avg.values[0], o_row.cpu_avg.values[0]
    sm, om = s_row.mem_avg.values[0], o_row.mem_avg.values[0]
    cpu_d = (oc - sc) / sc * 100 if sc else 0
    mem_d = (om - sm) / sm * 100 if sm else 0
    print(f"{scenario:<25} CPU: {cpu_d:+.1f}%   MEM: {mem_d:+.1f}%")
"""

# ── Map each cell index to its new source ───────────────────────────────────
# Identify cells by a unique fragment of their existing source

REPLACEMENTS = {
    # (fragment to find, new source)
    "import json\nimport os\nimport glob": SETUP,
    "P95 Latency — Overall": None,      # markdown — skip
    "ax.set_yscale(\"log\")": CHART_P95,
    "ORM Overhead (%) vs the 20": None, # markdown — skip
    "pivot[\"delta_pct\"] = (pivot[\"orm\"]": CHART_OVERHEAD,
    "Throughput (requests/second)": None,
    "chart_throughput": CHART_THROUGHPUT,
    "Per-Operation Latency Breakdown": None,
    "def extract_op_p95": CHART_PER_OP,
    "Latency Percentile Profiles": None,
    "core = [\"02-crud\"": CHART_PERCENTILES,
    "chart_micro_benchmark.png": CHART_MICRO,
    "chart_literature_comparison.png": CHART_LIT,
    "chart_loc.png": CHART_LOC,
    "chart_resources.png": CHART_RESOURCES,
}

with open(NB, encoding="utf-8") as f:
    nb = json.load(f)

replaced = 0
for cell in nb["cells"]:
    src = "".join(cell.get("source", ""))
    for fragment, new_src in REPLACEMENTS.items():
        if fragment in src and new_src is not None:
            cell["source"] = new_src
            cell["outputs"] = []
            cell["execution_count"] = None
            replaced += 1
            break

with open(NB, "w", encoding="utf-8") as f:
    json.dump(nb, f, ensure_ascii=False, indent=1)

print(f"Replaced {replaced} cells")
