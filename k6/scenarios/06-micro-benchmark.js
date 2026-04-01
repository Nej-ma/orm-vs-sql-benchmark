/**
 * Scénario 06 – Micro-benchmark (8 types de requêtes isolés)
 *
 * Inspiré de Yusmita et al. (2025) "Optimizing Database Access Strategy:
 * A Performance Analysis Comparison of Raw SQL and Prisma ORM"
 * Procedia Computer Science 269, pp. 1201–1210.
 * DOI: 10.1016/j.procs.2025.09.061
 *
 * Protocole :
 *   - 1 VU (exécution séquentielle, pas de concurrence)
 *   - 100 itérations par type de requête
 *   - Chaque type isolé via un tag {op:...}
 *   - Mesures : latence moyenne, P95, écart-type (via k6)
 *
 * Types testés (mapping Yusmita → nos endpoints) :
 *   find_all        → GET /users?limit=50
 *   find_one        → GET /users/:id
 *   nested_find     → GET /posts/:id   (post + author + tags, N-N join)
 *   create          → POST /users
 *   nested_create   → POST /posts      (post + tag associations)
 *   update          → PUT /users/:id
 *   nested_update   → PUT /posts/:id   (post + replace tags)
 *   delete          → DELETE /users/:id (range réservée pour ce scénario)
 */
import http  from "k6/http";
import { check, sleep } from "k6";

export const options = {
  // Strictly sequential — mirrors Yusmita et al. methodology
  vus:        1,
  iterations: 800,   // 100 per type × 8 types
  thresholds: {
    "http_req_duration{op:find_all}":      ["p(95)<2000", "avg<500"],
    "http_req_duration{op:find_one}":      ["p(95)<500",  "avg<100"],
    "http_req_duration{op:nested_find}":   ["p(95)<2000", "avg<500"],
    "http_req_duration{op:create}":        ["p(95)<2000", "avg<500"],
    "http_req_duration{op:nested_create}": ["p(95)<2000", "avg<500"],
    "http_req_duration{op:update}":        ["p(95)<2000", "avg<500"],
    "http_req_duration{op:nested_update}": ["p(95)<2000", "avg<500"],
    "http_req_duration{op:delete}":        ["p(95)<2000", "avg<500"],
  },
};

const BASE_URL  = __ENV.BASE_URL || "http://localhost:3001";
const HEADERS   = { "Content-Type": "application/json" };
const TAG_IDS   = [1, 3, 5, 7];  // fixed existing tag IDs

// DELETE target range: IDs 7000–7999 (1000 IDs, reserved for this scenario)
// These users may or may not exist; 404 is acceptable
let deleteCounter = 7000;

// Cycling post IDs for nested_find / nested_update (stay in lower half to avoid missing)
let postCounter  = 1;
let userCounter  = 100;

// Determine which of the 8 operation types to execute based on iteration index
// Each type runs exactly 100 times (iterations 0–99 = op0, 100–199 = op1, …)
const OPS = [
  "find_all",
  "find_one",
  "nested_find",
  "create",
  "nested_create",
  "update",
  "nested_update",
  "delete",
];

export default function () {
  // __ITER is 0-indexed global iteration count
  const opIndex = Math.floor(__ITER / 100) % OPS.length;
  const op      = OPS[opIndex];

  let res;

  if (op === "find_all") {
    // Find all — paginated list, single table
    res = http.get(`${BASE_URL}/users?limit=50&page=1`, { tags: { op: "find_all" } });
    check(res, { "find_all 200": (r) => r.status === 200 });

  } else if (op === "find_one") {
    // Find one — lookup by primary key
    const id = (userCounter++ % 9000) + 500;
    res = http.get(`${BASE_URL}/users/${id}`, { tags: { op: "find_one" } });
    check(res, { "find_one ok": (r) => [200, 404].includes(r.status) });

  } else if (op === "nested_find") {
    // Nested find — post + author + tags (N-N join)
    const id = (postCounter++ % 28000) + 500;
    res = http.get(`${BASE_URL}/posts/${id}`, { tags: { op: "nested_find" } });
    check(res, { "nested_find ok": (r) => [200, 404].includes(r.status) });

  } else if (op === "create") {
    // Create — single table insert
    const ts = Date.now() + Math.random();
    res = http.post(
      `${BASE_URL}/users`,
      JSON.stringify({
        name:  `Bench_${ts}`,
        email: `bench_${ts}_${Math.random().toString(36).slice(2)}@micro.test`,
        age:   25,
        city:  "Paris",
      }),
      { headers: HEADERS, tags: { op: "create" } }
    );
    check(res, { "create 201": (r) => r.status === 201 });

  } else if (op === "nested_create") {
    // Nested create — post + tag associations (transaction)
    const ts = Date.now() + Math.random();
    res = http.post(
      `${BASE_URL}/posts`,
      JSON.stringify({
        user_id:   (Math.floor(Math.random() * 8000) + 100),
        title:     `Micro bench post ${ts}`,
        content:   "Benchmark content for nested create.",
        published: true,
        tag_ids:   TAG_IDS,
      }),
      { headers: HEADERS, tags: { op: "nested_create" } }
    );
    check(res, { "nested_create 201": (r) => r.status === 201 });

  } else if (op === "update") {
    // Update — single table update by pk
    const id = (userCounter % 8000) + 500;
    res = http.put(
      `${BASE_URL}/users/${id}`,
      JSON.stringify({ city: "Lyon" }),
      { headers: HEADERS, tags: { op: "update" } }
    );
    check(res, { "update ok": (r) => [200, 404].includes(r.status) });

  } else if (op === "nested_update") {
    // Nested update — update post + replace its tag associations (transaction)
    const id = (postCounter % 25000) + 500;
    res = http.put(
      `${BASE_URL}/posts/${id}`,
      JSON.stringify({
        title:   `Updated title ${Date.now()}`,
        tag_ids: [2, 4, 6],
      }),
      { headers: HEADERS, tags: { op: "nested_update" } }
    );
    check(res, { "nested_update ok": (r) => [200, 404].includes(r.status) });

  } else if (op === "delete") {
    // Delete — single row delete
    const id = deleteCounter++;
    res = http.del(`${BASE_URL}/users/${id}`, null, { tags: { op: "delete" } });
    check(res, { "delete ok": (r) => [204, 404].includes(r.status) });
  }

  // No sleep — sequential execution, measure raw query performance
}
