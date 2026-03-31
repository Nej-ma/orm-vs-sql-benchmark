/**
 * Scénario 03 – Read-heavy (lecture intensive)
 * Objectif : simuler une charge réaliste dominée par les lectures (80/20).
 * Inclut pagination, filtres, et recherche full-text.
 *
 * Charge : rampe jusqu'à 100 VUs, maintenu 5 min.
 */
import http  from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL, randomUserId, randomPostId, randomPage, randomTag, COMMON_THRESHOLDS } from "../config.js";

export const options = {
  stages: [
    { duration: "30s", target: 50  },
    { duration: "30s", target: 100 },
    { duration: "5m",  target: 100 },
    { duration: "30s", target: 0   },
  ],
  thresholds: {
    ...COMMON_THRESHOLDS,
    "http_req_duration{op:list_users}":    ["p(95)<800"],
    "http_req_duration{op:list_posts}":    ["p(95)<1000"],
    "http_req_duration{op:get_post}":      ["p(95)<600"],
    "http_req_duration{op:user_posts}":    ["p(95)<800"],
    "http_req_duration{op:posts_by_tag}":  ["p(95)<1200"],
  },
};

const SEARCH_TERMS = ["user", "paris", "a", "m", "tech", "dev"];

export default function () {
  const roll = Math.random();

  if (roll < 0.20) {
    // List users avec pagination
    const res = http.get(
      `${BASE_URL}/users?page=${randomPage()}&limit=20`,
      { tags: { op: "list_users" } }
    );
    check(res, { "list users 200": (r) => r.status === 200 });

  } else if (roll < 0.30) {
    // Search users
    const term = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)];
    const res  = http.get(
      `${BASE_URL}/users?search=${term}&limit=20`,
      { tags: { op: "search_users" } }
    );
    check(res, { "search users 200": (r) => r.status === 200 });

  } else if (roll < 0.45) {
    // List posts (avec jointure auteur + tags)
    const res = http.get(
      `${BASE_URL}/posts?page=${randomPage()}&limit=20`,
      { tags: { op: "list_posts" } }
    );
    check(res, { "list posts 200": (r) => r.status === 200 });

  } else if (roll < 0.60) {
    // Get single post (jointure complète)
    const res = http.get(
      `${BASE_URL}/posts/${randomPostId()}`,
      { tags: { op: "get_post" } }
    );
    check(res, { "get post ok": (r) => [200, 404].includes(r.status) });

  } else if (roll < 0.80) {
    // Posts d'un utilisateur (1-N)
    const res = http.get(
      `${BASE_URL}/users/${randomUserId()}/posts?limit=20`,
      { tags: { op: "user_posts" } }
    );
    check(res, { "user posts ok": (r) => [200, 404].includes(r.status) });

  } else {
    // Posts filtrés par tag (jointure N-N)
    const res = http.get(
      `${BASE_URL}/posts/search/by-tag/${randomTag()}?limit=20`,
      { tags: { op: "posts_by_tag" } }
    );
    check(res, { "posts by tag 200": (r) => r.status === 200 });
  }

  sleep(0.05 + Math.random() * 0.1);
}
