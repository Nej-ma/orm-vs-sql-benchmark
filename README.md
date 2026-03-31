# ORM vs Raw SQL Benchmark

> **Research question:** In which scenarios does an ORM genuinely improve developer productivity without degrading API performance beyond an acceptable threshold compared to native SQL?

A rigorous, reproducible benchmark comparing two data-access strategies for a Node.js REST API backed by PostgreSQL:

| Implementation | Stack |
|---|---|
| **sql-api** | Node.js · Express · [`pg`](https://node-postgres.com/) driver (raw SQL) |
| **orm-api** | Node.js · Express · [Prisma](https://www.prisma.io/) ORM |

Both APIs expose **identical endpoints**, share the **same PostgreSQL database**, and run in **identical Docker containers** — isolating the ORM layer as the only variable.

---

## Motivation

AI-generated code systematically reaches for Prisma. Hand-written backend code often stays with raw SQL. Which approach actually wins — and under what conditions? This study quantifies the trade-off across four dimensions:

- **Latency** (avg, P90, P95, P99)
- **Throughput** (req/s)
- **Resource usage** (CPU %, RAM)
- **Developer productivity** (lines of code, schema definition overhead)

---

## Repository Structure

```
orm-vs-sql-benchmark/
├── docker-compose.yml           # Orchestrates all services
├── init.sql                     # PostgreSQL schema + seed tags
├── PROTOCOL.md                  # Full study protocol
│
├── sql-api/                     # Raw SQL implementation
│   ├── src/
│   │   ├── index.js
│   │   ├── db.js                # pg connection pool
│   │   └── routes/
│   │       ├── users.js         # CRUD + pagination + search
│   │       └── posts.js         # CRUD + joins (1-N, N-N)
│   └── Dockerfile
│
├── orm-api/                     # Prisma ORM implementation
│   ├── prisma/
│   │   └── schema.prisma        # Prisma data models
│   ├── src/
│   │   ├── index.js
│   │   └── routes/
│   │       ├── users.js
│   │       └── posts.js
│   └── Dockerfile
│
├── seed/                        # Test data generator
│   └── seed.js                  # 10 000 users · 30 000 posts · 20 tags
│
├── k6/                          # Load test scenarios
│   ├── config.js                # Shared configuration & helpers
│   └── scenarios/
│       ├── 01-smoke.js          # Sanity check (1 VU · 1 min)
│       ├── 02-crud.js           # Mixed CRUD (50 VUs · 4 min)
│       ├── 03-read-heavy.js     # Read-dominant workload (100 VUs · 6 min)
│       ├── 04-complex-queries.js# N-N joins under load (50 VUs · 5 min)
│       └── 05-stress.js         # Ramp to 200 VUs · 7 min
│
├── scripts/
│   ├── run-benchmark.sh         # Runs all scenarios on both APIs, saves results
│   ├── analyze-results.sh       # Parses k6 JSON → comparison CSV + report
│   └── collect-stats-manual.sh  # Polls docker stats during a test run
│
└── results/                     # Auto-generated benchmark outputs (gitignored)
```

---

## Database Schema

```
users (id, name, email, age, city, created_at)
  └─< posts (id, user_id, title, content, published, view_count, created_at)
              └─< post_tags (post_id↑, tag_id↑) >─ tags (id, name, slug)
```

Relationships exercised:
- **1-to-many**: one user → many posts
- **many-to-many**: posts ↔ tags (junction table)

This schema deliberately triggers the join scenarios where ORM and raw SQL most commonly diverge in performance.

---

## API Endpoints

| Method | Path | Query type |
|--------|------|-----------|
| `GET` | `/health` | Health check |
| `GET` | `/users` | Paginated list + `search` / `city` filters |
| `GET` | `/users/:id` | Single row lookup |
| `POST` | `/users` | Insert |
| `PUT` | `/users/:id` | Conditional update |
| `DELETE` | `/users/:id` | Delete |
| `GET` | `/users/:id/posts` | 1-N join (user → posts) |
| `GET` | `/posts` | N-N join (posts + author + tags, paginated) |
| `GET` | `/posts/:id` | Full post with author + tags |
| `POST` | `/posts` | Insert with tag associations |
| `GET` | `/posts/search/by-tag/:slug` | N-N filter (posts by tag) |

---

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — that's it.

k6 runs as a Docker container (`grafana/k6:latest`) on the same network as the APIs — no local installation needed.

### 1. Start the stack

```bash
docker compose up -d --build
```

Verify both APIs are up:

```bash
curl http://localhost:3001/health   # sql-api  → {"status":"ok","implementation":"sql-native"}
curl http://localhost:3002/health   # orm-api  → {"status":"ok","implementation":"prisma-orm"}
```

### 2. Seed the database

```bash
docker compose --profile seed run --rm seeder
```

Inserts **10 000 users · 30 000 posts · 20 tags · ~75 000 post-tag associations**.

### 3. Run a single scenario (manual)

k6 runs inside Docker on the same network as the APIs, so internal service names are used as hostnames.

> **Windows (Git Bash) note:** prefix commands with `MSYS_NO_PATHCONV=1` to prevent Git Bash from rewriting `/scripts/` as a Windows path.

```bash
# Against raw SQL API
MSYS_NO_PATHCONV=1 docker compose run --rm k6 run \
  --env BASE_URL=http://sql-api:3001 \
  //scripts/scenarios/03-read-heavy.js

# Against Prisma ORM API
MSYS_NO_PATHCONV=1 docker compose run --rm k6 run \
  --env BASE_URL=http://orm-api:3002 \
  //scripts/scenarios/03-read-heavy.js
```

### 4. Run the full benchmark suite

```bash
bash scripts/run-benchmark.sh
```

Results are saved to `results/run_YYYYMMDD_HHMMSS/`.

### 5. Analyze results

```bash
bash scripts/analyze-results.sh results/run_YYYYMMDD_HHMMSS/
```

Outputs a CSV comparison table and a human-readable report.

---

## Load Test Scenarios

| # | Scenario | VUs | Duration | Purpose |
|---|----------|-----|----------|---------|
| 1 | Smoke | 1 | 1 min | Verify all endpoints respond correctly |
| 2 | CRUD | 0 → 50 → 0 | ~4 min | Mixed read/write workload (60% GET, 20% POST, 10% PUT, 10% DELETE) |
| 3 | Read-heavy | 0 → 100 → 0 | ~6 min | Realistic API traffic (80% reads, pagination, full-text search) |
| 4 | Complex queries | 50 (constant) | 5 min | Sustained pressure on N-N join endpoints |
| 5 | Stress | 0 → 200 → 0 | 7 min | Progressive ramp to find saturation point |

---

## Hypotheses

1. Raw SQL will outperform Prisma on complex joins, especially under load.
2. The gap will be small (< 20%) on simple CRUD operations at low concurrency.
3. The performance difference will widen as concurrency increases (connection pool pressure).
4. Prisma will require fewer application-level lines of code for CRUD, but adds schema/migration overhead.

---

## Fairness Rules

- Same PostgreSQL instance, same dataset, same indexes for both APIs.
- Connection pool capped at **20** for both implementations.
- No manual SQL optimization (no query hints, no stored procedures).
- No application-level caching (Redis, in-memory) — isolates the ORM variable.
- Each scenario runs against one API, then the other, with a **15-30 s cooldown** between runs.
- Tests are run in sequence (not simultaneously) to avoid resource contention.

---

## Study Context

This benchmark is part of an *Application de la Démarche Scientifique* (ADS) — a research methodology assignment at [CESI École d'Ingénieurs](https://www.cesi.fr), conducted during the 4th year of the FISA Informatique program.

The research question emerged from real-world observations: AI code generation tools systematically choose Prisma as a data layer, while experienced developers often prefer raw SQL for performance-critical paths. This study aims to quantify when each approach is justified.

---

## License

MIT
