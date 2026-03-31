# Development Log

Tracks actual implementation time and decisions made during development.
Referenced by PROTOCOL.md §7.3 for developer productivity assessment.

---

## sql-api (raw SQL with pg driver)

**Implementation date:** 2026-03-31  
**Total implementation time:** ~2h (infrastructure setup included)

### Time breakdown

| Task | Time (approx.) |
|---|---|
| pg pool setup (`db.js`) | 10 min |
| Users routes — CRUD | 30 min |
| Users routes — `/users/:id/posts` (1-N join) | 15 min |
| Posts routes — list with N-N join (`json_agg`) | 40 min |
| Posts routes — filter by tag, POST with tags | 25 min |
| Debugging & testing endpoints | 20 min |
| **Total** | **~2h 20 min** |

### Key observations

- The `json_agg` + `GROUP BY` pattern for assembling N-N relations in a single query required explicit SQL knowledge.
- Transaction handling for `POST /posts` (inserting post + tags atomically) required explicit `BEGIN/COMMIT/ROLLBACK` management.
- No schema definition file beyond `init.sql` — schema lives entirely in the database.
- No migration tooling: schema changes require manual SQL.
- Error messages from PostgreSQL are explicit and directly actionable (e.g., unique constraint violations).

---

## orm-api (Prisma ORM)

**Implementation date:** 2026-03-31  
**Total implementation time:** ~1h 45 min (excluding Prisma setup issues)

### Time breakdown

| Task | Time (approx.) |
|---|---|
| Prisma schema definition (`schema.prisma`) | 20 min |
| Prisma Client setup & Docker config (OpenSSL issue) | 25 min |
| Users routes — CRUD | 25 min |
| Users routes — `/users/:id/posts` | 10 min |
| Posts routes — list with `include` (N-N relations) | 25 min |
| Posts routes — filter by tag, POST with nested create | 20 min |
| Response reshaping (postTags → tags) | 10 min |
| **Total** | **~2h 15 min** |

### Key observations

- Prisma schema is compact but introduces a separate `prisma/` directory and generated client.
- The `binaryTargets` configuration was required for Alpine Linux (Docker) — non-obvious for beginners.
- `$transaction([count, findMany])` provides parallel execution cleanly.
- Nested `include` for N-N relations is readable but generates multiple SQL queries under the hood (Prisma uses separate SELECT + JOIN strategy rather than a single aggregated query).
- Response reshaping was needed: Prisma returns `postTags: [{ tag: {...} }]` — must be flattened to `tags: [...]` to match the sql-api response shape.
- Prisma errors (`P2025` for not found) are well-documented but require mapping to HTTP status codes.
- Domain familiarity from sql-api reduced implementation time on the business logic side.

---

## Comparative Notes

| Dimension | sql-api | orm-api |
|---|---|---|
| Implementation time | ~2h 20 min | ~2h 15 min (incl. 25 min Prisma setup) |
| Lines of code (src/) | TBD (see loc_report.txt after benchmark) | TBD |
| Schema definition files | `init.sql` (shared) | `prisma/schema.prisma` + `init.sql` |
| Migration tooling | None (manual SQL) | Prisma Migrate |
| Transaction handling | Explicit (`BEGIN/COMMIT`) | Implicit (Prisma handles atomicity) |
| N-N query strategy | Single SQL with `json_agg` | Separate queries via `include` |
| Error transparency | Direct from PostgreSQL | Wrapped in Prisma error codes |
| Setup complexity | Low (only pg pool config) | Medium (schema, generate, binaryTargets) |
