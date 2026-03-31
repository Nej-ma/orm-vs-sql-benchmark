/**
 * Scénario 02 – CRUD simple
 * Objectif : mesurer la latence des opérations CRUD de base (lecture + écriture).
 * Mix : 60% GET, 20% POST, 10% PUT, 10% DELETE
 *
 * Charge : rampe de 0 à 50 VUs en 30 s, maintenu 3 min, descente 30 s.
 */
import http  from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";
import { BASE_URL, randomUserId, COMMON_THRESHOLDS } from "../config.js";

const createdUsers = new Counter("created_users");

export const options = {
  stages: [
    { duration: "30s", target: 50  },
    { duration: "3m",  target: 50  },
    { duration: "30s", target: 0   },
  ],
  thresholds: {
    ...COMMON_THRESHOLDS,
    "http_req_duration{op:get_user}":    ["p(95)<500"],
    "http_req_duration{op:list_users}":  ["p(95)<800"],
    "http_req_duration{op:create_user}": ["p(95)<1000"],
  },
};

const HEADERS = { "Content-Type": "application/json" };

export default function () {
  const roll = Math.random();

  if (roll < 0.60) {
    // GET single user
    const id  = randomUserId();
    const res = http.get(`${BASE_URL}/users/${id}`, { tags: { op: "get_user" } });
    check(res, { "get user ok": (r) => [200, 404].includes(r.status) });

  } else if (roll < 0.70) {
    // GET list
    const page = Math.floor(Math.random() * 20) + 1;
    const res  = http.get(`${BASE_URL}/users?page=${page}&limit=20`, { tags: { op: "list_users" } });
    check(res, { "list users ok": (r) => r.status === 200 });

  } else if (roll < 0.85) {
    // POST create user
    const ts  = Date.now();
    const res = http.post(
      `${BASE_URL}/users`,
      JSON.stringify({
        name:  `User_${ts}`,
        email: `user_${ts}_${Math.random().toString(36).slice(2)}@bench.test`,
        age:   Math.floor(Math.random() * 50) + 18,
        city:  "Paris",
      }),
      { headers: HEADERS, tags: { op: "create_user" } }
    );
    if (res.status === 201) createdUsers.add(1);
    check(res, { "create user 201": (r) => r.status === 201 });

  } else if (roll < 0.95) {
    // PUT update user
    const id  = randomUserId();
    const res = http.put(
      `${BASE_URL}/users/${id}`,
      JSON.stringify({ city: "Lyon", age: Math.floor(Math.random() * 40) + 20 }),
      { headers: HEADERS, tags: { op: "update_user" } }
    );
    check(res, { "update user ok": (r) => [200, 404].includes(r.status) });

  } else {
    // DELETE user (on choisit dans la plage haute pour ne pas casser le dataset)
    const id  = 9500 + Math.floor(Math.random() * 400);
    const res = http.del(`${BASE_URL}/users/${id}`, null, { tags: { op: "delete_user" } });
    check(res, { "delete ok": (r) => [204, 404].includes(r.status) });
  }

  sleep(0.1);
}
