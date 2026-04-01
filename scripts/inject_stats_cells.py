"""Inject CPU/memory stats cells into analysis.ipynb after the LOC markdown cell."""
import json

with open("analysis.ipynb", encoding="utf-8") as f:
    nb = json.load(f)

md_cell = {
    "cell_type": "markdown",
    "metadata": {},
    "source": (
        "## 9b. CPU & Memory Consumption\n\n"
        "Docker stats collected every 2 s during each k6 run (`docker stats --no-stream`).\n"
        "Metrics captured: CPU% and resident memory (MiB) for `ads_sql_api` / `ads_orm_api`.\n\n"
        "> **Note:** CPU% on a multi-core machine can exceed 100% (e.g. 300% = 3 cores fully used).  \n"
        "> Memory is RSS (resident set size) — what the process actually holds in RAM."
    ),
}

code_parse = {
    "cell_type": "code",
    "execution_count": None,
    "metadata": {},
    "outputs": [],
    "source": """\
def parse_stats_csv(path):
    rows = []
    with open(path) as f:
        f.readline()  # header
        for line in f:
            parts = line.strip().split(",")
            if len(parts) < 4:
                continue
            container = parts[1]
            if "api" not in container:
                continue
            cpu_str = parts[2]
            mem_str = parts[3]
            try:
                cpu = float(cpu_str.replace("%", ""))
                mem_part = mem_str.split("/")[0].strip()
                if "GiB" in mem_part:
                    mem = float(mem_part.replace("GiB", "")) * 1024
                elif "kB" in mem_part:
                    mem = float(mem_part.replace("kB", "")) / 1024
                else:
                    mem = float(mem_part.replace("MiB", "").replace("MB", ""))
                rows.append({"cpu": cpu, "mem": mem})
            except (ValueError, IndexError):
                continue
    return rows

stats_summary = []
for scenario in scenarios:
    for impl in ["sql", "orm"]:
        path = RUN_DIR / f"{scenario}_{impl}_docker_stats.csv"
        if not path.exists():
            continue
        rows = parse_stats_csv(path)
        if not rows:
            continue
        cpus = [r["cpu"] for r in rows]
        mems = [r["mem"] for r in rows]
        stats_summary.append({
            "scenario": scenario,
            "impl":     impl,
            "cpu_avg":  round(sum(cpus)/len(cpus), 1),
            "cpu_max":  round(max(cpus), 1),
            "mem_avg":  round(sum(mems)/len(mems), 1),
            "mem_max":  round(max(mems), 1),
        })

stats_df = pd.DataFrame(stats_summary)
print("=== CPU & Memory per scenario ===")
display(stats_df[["scenario","impl","cpu_avg","cpu_max","mem_avg","mem_max"]].round(1))
""",
}

code_chart = {
    "cell_type": "code",
    "execution_count": None,
    "metadata": {},
    "outputs": [],
    "source": """\
fig, axes = plt.subplots(1, 2, figsize=(14, 5))
xc = np.arange(len(scenarios))

for ax_idx, metric, ylabel, title in [
    (0, "cpu_avg", "Avg CPU usage (%)", "Average CPU usage (API container)"),
    (1, "mem_avg", "Avg Memory (MiB)",  "Average Memory usage (API container)"),
]:
    ax = axes[ax_idx]
    unit = "%" if ax_idx == 0 else " MiB"
    for i, impl in enumerate(["sql", "orm"]):
        sub  = stats_df[stats_df.impl == impl].set_index("scenario")
        vals = [sub.loc[s, metric] if s in sub.index else 0 for s in scenarios]
        bars = ax.bar(xc + i*0.35 - 0.175, vals, width=0.35,
                      label="Raw SQL" if impl == "sql" else "Prisma ORM",
                      color=COLORS[impl], alpha=0.88, zorder=3)
        for bar, v in zip(bars, vals):
            if v > 0:
                ax.text(bar.get_x()+bar.get_width()/2, bar.get_height()+0.5,
                        f"{v:.0f}{unit}", ha="center", va="bottom", fontsize=8)
    ax.set_xticks(xc)
    ax.set_xticklabels([SCENARIO_LABELS[s] for s in scenarios], fontsize=8)
    ax.set_ylabel(ylabel, fontsize=10)
    ax.set_title(title, fontsize=11, fontweight="bold")
    ax.legend(fontsize=9)
    ax.yaxis.grid(True, linestyle="--", alpha=0.4, zorder=0)

plt.suptitle("Resource consumption per scenario — Raw SQL vs Prisma ORM",
             fontsize=12, fontweight="bold")
plt.tight_layout()
plt.savefig(RUN_DIR / "chart_resources.png", dpi=150)
plt.show()

print("\\n=== ORM vs SQL resource overhead ===")
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
""",
}

# Insert after cell 20 (## 9. Code Complexity markdown), before cell 21 (LOC code)
insert_pos = 21
nb["cells"] = nb["cells"][:insert_pos] + [md_cell, code_parse, code_chart] + nb["cells"][insert_pos:]

with open("analysis.ipynb", "w", encoding="utf-8") as f:
    json.dump(nb, f, ensure_ascii=False, indent=1)

print(f"Done — notebook now has {len(nb['cells'])} cells")
