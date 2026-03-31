/**
 * Scénario 01 – Smoke Test
 * Objectif : vérifier que l'API répond correctement avant les vrais tests.
 * 1 VU, 1 minute, aucun seuil agressif.
 */
import http  from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL, randomUserId, randomPostId } from "../config.js";

export const options = {
  vus:      1,
  duration: "1m",
  thresholds: {
    http_req_failed:   ["rate<0.05"],
    http_req_duration: ["p(95)<5000"],
  },
};

export default function () {
  // Health check
  let r = http.get(`${BASE_URL}/health`);
  check(r, { "health OK": (res) => res.status === 200 });

  // Simple GET user
  r = http.get(`${BASE_URL}/users/${randomUserId()}`);
  check(r, { "get user 200|404": (res) => [200, 404].includes(res.status) });

  // Simple GET post
  r = http.get(`${BASE_URL}/posts/${randomPostId()}`);
  check(r, { "get post 200|404": (res) => [200, 404].includes(res.status) });

  // List users
  r = http.get(`${BASE_URL}/users?limit=20`);
  check(r, { "list users 200": (res) => res.status === 200 });

  sleep(1);
}
