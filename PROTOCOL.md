# Benchmark Protocol

**Study:** ORM vs Raw SQL — Impact on API latency and resource consumption  
**Author:** Nejma Moualhi — FISA Informatique A4, CESI École d'Ingénieurs  
**Company:** We Made Ya  
**Version:** 1.0

---

## 1. Research Question

> In which scenarios does an ORM (Prisma) genuinely improve developer productivity without degrading the performance of a Node.js REST API beyond an acceptable threshold, compared to a native SQL approach (pg driver)?

### Hypotheses

| # | Hypothesis |
|---|-----------|
| H1 | Raw SQL will yield lower P95 latency on complex join queries. |
| H2 | The performance gap will be negligible (< 20%) on simple CRUD at low concurrency. |
| H3 | Under high concurrency (≥ 100 VUs), the ORM overhead will become more pronounced. |
| H4 | Prisma will produce less application-level code for CRUD operations but introduce schema and migration overhead. |

---

## 2. System Under Test

### 2.1 Implementations

| Property | sql-api | orm-api |
|---|---|---|
| Runtime | Node.js 20 (Alpine) | Node.js 20 (Alpine) |
| Framework | Express 4 | Express 4 |
| Data layer | `pg` 8 (raw SQL) | Prisma 5 (ORM) |
| Connection pool | `pg.Pool` max=20 | Prisma default (max=20 equivalent) |
| Port | 3001 | 3002 |
| Container | `ads_sql_api` | `ads_orm_api` |

Both images are built from the same base (`node:20-alpine`) and deployed via the same `docker-compose.yml`. No process manager (PM2, cluster) is used — single Node.js process per container.

### 2.2 Database

| Property | Value |
|---|---|
| Engine | PostgreSQL 16 (Alpine Docker image) |
| Container | `ads_postgres` |
| Shared | Yes — both APIs connect to the same instance |
| Max connections | 100 (PostgreSQL default) |

### 2.3 Test Machine

All experiments were conducted on the following hardware:

| Property | Value |
|---|---|
| Device | Lenovo IdeaPad Gaming 3 15ACH6 |
| CPU | AMD Ryzen 5 5600H with Radeon Graphics (6 cores / 12 threads, 3.3–4.2 GHz) |
| RAM | 32 GB DDR4 (27.9 GB usable) |
| OS | Windows 11 Pro |
| Docker | Docker Desktop 4.41.2 (Linux engine via WSL2) |
| Node.js | v20.20.2 (inside container — `node:20-alpine`) |
| k6 | v1.7.1 (`grafana/k6:latest` Docker image) |

> **Note:** All services (PostgreSQL, sql-api, orm-api, k6) run inside Docker containers on the same bridge network. No network hop crosses the host OS, so latency measurements reflect pure application and ORM overhead, not networking.

### 2.4 k6 Execution Environment

k6 runs as a Docker container on the same Compose network as the APIs. Internal service hostnames are used — no localhost round-trip:

| Service | Internal URL (k6 → API) | External URL (browser/curl) |
|---|---|---|
| sql-api | `http://sql-api:3001` | `http://localhost:3001` |
| orm-api | `http://orm-api:3002` | `http://localhost:3002` |

This approach makes the benchmark **fully self-contained and reproducible** on any machine running Docker Desktop.

---

## 3. Dataset

| Table | Rows | Generation |
|---|---|---|
| `users` | 10 000 | `@faker-js/faker` — name, email, age, city |
| `posts` | 30 000 | 3 per user — title, content, published flag, view_count |
| `tags` | 20 | Fixed predefined set (JavaScript, Docker, Python, …) |
| `post_tags` | ~75 000 | 2–3 random tags per post |

### Schema

```sql
users      (id SERIAL PK, name, email UNIQUE, age, city, created_at)
posts      (id SERIAL PK, user_id FK→users, title, content, published, view_count, created_at)
tags       (id SERIAL PK, name UNIQUE, slug UNIQUE)
post_tags  (post_id FK→posts, tag_id FK→tags, PK(post_id, tag_id))
```

### Indexes

```sql
idx_posts_user_id     ON posts(user_id)
idx_posts_published   ON posts(published)
idx_posts_created_at  ON posts(created_at DESC)
idx_users_email       ON users(email)
idx_users_city        ON users(city)
idx_post_tags_tag_id  ON post_tags(tag_id)
```

Indexes are created by `init.sql` before seeding and are **identical for both implementations**.

### Regenerating the dataset

```bash
docker compose --profile seed run --rm seeder
```

The seeder truncates existing data before inserting — runs are reproducible.

---

## 4. Endpoints Retained

The following endpoints were selected to cover three distinct query complexity levels:

### Level 1 — Simple CRUD (single-table)

| Endpoint | SQL complexity |
|---|---|
| `GET /users?page&limit&search&city` | SELECT + WHERE + LIMIT/OFFSET + COUNT |
| `GET /users/:id` | SELECT WHERE pk |
| `POST /users` | INSERT RETURNING |
| `PUT /users/:id` | UPDATE WHERE pk |
| `DELETE /users/:id` | DELETE WHERE pk |

### Level 2 — 1-to-Many join

| Endpoint | SQL complexity |
|---|---|
| `GET /users/:id/posts` | 2 queries: user lookup + posts WHERE user_id |

### Level 3 — Many-to-Many join (most discriminating)

| Endpoint | SQL complexity |
|---|---|
| `GET /posts` | JOIN users + LEFT JOIN post_tags + LEFT JOIN tags + GROUP BY + json_agg |
| `GET /posts/:id` | Same as above, single row |
| `GET /posts/search/by-tag/:slug` | JOIN + filter through junction table |
| `GET /posts?tag=&published=` | Subquery EXISTS filter on post_tags |

Level 3 endpoints are the most relevant for differentiating ORM and raw SQL: ORMs must either generate multiple queries (N+1 risk) or produce complex `include` chains, while raw SQL can express the full query in a single round-trip.

---

## 5. Load Scenarios

All scenarios use k6. The `BASE_URL` environment variable selects the target implementation.

### 5.1 Scenario Matrix

| Scenario | File | VUs | Duration | Endpoint mix |
|---|---|---|---|---|
| Smoke | `01-smoke.js` | 1 | 1 min | Health + GET user + GET post + list |
| CRUD | `02-crud.js` | 0→50→0 | ~4 min | 60% GET user, 10% list, 15% POST, 10% PUT, 5% DELETE |
| Read-heavy | `03-read-heavy.js` | 0→100→0 | ~6 min | 20% list users, 10% search, 15% list posts, 15% GET post, 20% user posts, 20% posts-by-tag |
| Complex queries | `04-complex-queries.js` | 50 | 5 min | 35% GET post (full), 30% posts-by-tag, 15% posts filtered, 20% user posts |
| Stress | `05-stress.js` | 0→200→0 | 7 min | Mix — objective is to find saturation, not measure steady-state |

### 5.2 Execution Order

Each scenario runs **sequentially**:
1. Run scenario against `sql-api` → save output
2. Wait **15 seconds** (cooldown)
3. Run same scenario against `orm-api` → save output
4. Wait **30 seconds** before next scenario

This avoids thermal throttling and ensures the database buffer cache is in a comparable state.

### 5.3 Running the full suite

```bash
bash scripts/run-benchmark.sh
```

To run a single scenario manually (Windows Git Bash):

```bash
# MSYS_NO_PATHCONV=1 prevents Git Bash from converting /scripts/ to a Windows path
MSYS_NO_PATHCONV=1 docker compose run --rm k6 run \
  --env BASE_URL=http://sql-api:3001 \
  --out json=//results/manual_sql.json \
  //scripts/scenarios/03-read-heavy.js
```

---

## 6. Metrics Collected

### 6.1 Latency & Throughput (via k6)

| Metric | Description | k6 key |
|---|---|---|
| Average latency | Mean HTTP response time | `http_req_duration.avg` |
| Median latency | P50 | `http_req_duration.med` |
| P90 | 90th percentile response time | `http_req_duration.p(90)` |
| **P95** | **Primary comparison metric** | `http_req_duration.p(95)` |
| P99 | 99th percentile response time | `http_req_duration.p(99)` |
| Max latency | Worst observed response time | `http_req_duration.max` |
| Error rate | % of failed HTTP requests | `http_req_failed.rate` |
| Throughput | Requests per second | `http_reqs.rate` |
| Total requests | Absolute count | `http_reqs.count` |

> **P95 is the primary comparison metric**: it represents the worst-case experience for 95% of users and is less sensitive to outliers than P99 or max.

### 6.2 Resource Usage (via docker stats)

| Metric | Command | Sampling interval |
|---|---|---|
| CPU % | `docker stats --no-stream` | Every 2 seconds |
| RAM usage (MB) | `docker stats --no-stream` | Every 2 seconds |
| RAM % | `docker stats --no-stream` | Every 2 seconds |

Collected automatically by `run-benchmark.sh` into `*_docker_stats.csv` files.

Manual collection during a test:
```bash
bash scripts/collect-stats-manual.sh results/my_run_stats.csv 2
```

### 6.3 Code Complexity

Measured after implementation, before benchmarking:

| Metric | Method |
|---|---|
| Lines of code (LOC) | `wc -l` on `src/**/*.js` |
| Schema definition LOC | `wc -l` on `prisma/schema.prisma` |
| Number of source files | `find src/ -name '*.js' \| wc -l` |

Captured automatically by `run-benchmark.sh` into `loc_report.txt`.

---

## 7. Comparison Rules

### 7.1 Fairness Constraints

| Rule | Rationale |
|---|---|
| Same PostgreSQL instance | Eliminates network and DB tuning variables |
| Same dataset and indexes | Identical query planner conditions |
| Same connection pool size (max=20) | Normalizes concurrency capacity |
| No manual SQL optimization | Reflects real-world usage, not expert tuning |
| No application-level cache | Isolates the ORM variable from caching effects |
| Sequential test runs with cooldown | Prevents resource contention between implementations |
| Single Node.js process per container | No cluster-mode advantage for either implementation |

### 7.2 Decision Criteria

A result is considered **statistically meaningful** when:
- The scenario ran for at least 1 minute of steady state.
- Error rate < 1% for both implementations.
- Total request count > 500 per implementation per scenario.

**ORM is considered acceptable** if:
- P95 latency overhead ≤ 20% vs raw SQL **for the same scenario and endpoint mix**.
- Error rate remains < 1% at the same VU count.

**Raw SQL is considered preferable** if:
- P95 overhead exceeds 20% on Level 3 (join) scenarios under moderate or high load.

### 7.3 Developer Productivity Assessment

Productivity is assessed qualitatively alongside LOC counts:

| Dimension | What we measure |
|---|---|
| Schema definition | Does Prisma's schema add meaningful overhead? |
| Migration tooling | Ease of schema evolution |
| Query expressiveness | How readable are complex join queries in each approach? |
| Error handling | Are errors more explicit in raw SQL or through the ORM? |
| Development time | Time to implement the same feature (estimated) |

---

## 8. Output Files

After a full benchmark run, the `results/run_YYYYMMDD_HHMMSS/` directory contains:

| File | Content |
|---|---|
| `{scenario}_{impl}.json` | Full k6 time-series output |
| `{scenario}_{impl}_summary.json` | k6 aggregated summary (avg, P95, etc.) |
| `{scenario}_{impl}.log` | k6 console output |
| `{scenario}_{impl}_docker_stats.csv` | CPU/RAM samples during the run |
| `comparison.csv` | Side-by-side comparison of all metrics |
| `comparison_report.txt` | Human-readable summary with delta percentages |
| `loc_report.txt` | Lines-of-code count for both implementations |

### Analyzing results

```bash
bash scripts/analyze-results.sh results/run_YYYYMMDD_HHMMSS/
```

---

## 9. Reproducibility Checklist

Before each benchmark run, verify:

- [ ] Both APIs return `{"status":"ok"}` on `/health`
- [ ] Database contains exactly 10 000 users and 30 000 posts (re-run seeder if needed)
- [ ] No other significant CPU/RAM workload on the host machine
- [ ] Docker Desktop memory limit ≥ 4 GB
- [ ] cooldown respected between runs (enforced by `run-benchmark.sh`)
- [ ] k6 version pinned (see Prerequisites in README)

To reset the database to a clean state:

```bash
docker compose --profile seed run --rm seeder
```
