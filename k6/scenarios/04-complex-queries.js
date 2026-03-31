/**
 * Scénario 04 – Requêtes complexes (jointures N-N, filtres combinés)
 * Objectif : stresser spécifiquement les requêtes qui génèrent des jointures
 * complexes — c'est là que la différence ORM vs SQL natif est la plus marquée.
 *
 * Charge : 50 VUs constants, 5 minutes.
 */
import http  from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL, randomUserId, randomPostId, randomTag, COMMON_THRESHOLDS } from "../config.js";

export const options = {
  vus:      50,
  duration: "5m",
  thresholds: {
    ...COMMON_THRESHOLDS,
    // Seuils plus stricts pour isoler les jointures
    "http_req_duration{op:post_full}":       ["p(95)<1500", "p(99)<3000"],
    "http_req_duration{op:posts_by_tag}":    ["p(95)<1500", "p(99)<3000"],
    "http_req_duration{op:posts_published}": ["p(95)<1200"],
  },
};

export default function () {
  const roll = Math.random();

  if (roll < 0.35) {
    // GET post avec auteur + tous ses tags (jointure complète)
    const id  = randomPostId();
    const res = http.get(`${BASE_URL}/posts/${id}`, { tags: { op: "post_full" } });
    check(res, {
      "post full ok":     (r) => [200, 404].includes(r.status),
      "has author field": (r) => {
        if (r.status !== 200) return true;
        const body = r.json();
        return body.author !== undefined;
      },
      "has tags array": (r) => {
        if (r.status !== 200) return true;
        const body = r.json();
        return Array.isArray(body.tags);
      },
    });

  } else if (roll < 0.65) {
    // Posts par tag (jointure N-N + tri par popularité)
    const res = http.get(
      `${BASE_URL}/posts/search/by-tag/${randomTag()}?limit=20`,
      { tags: { op: "posts_by_tag" } }
    );
    check(res, { "posts by tag 200": (r) => r.status === 200 });

  } else if (roll < 0.80) {
    // Posts filtrés par published + tag (double filtre + jointure)
    const res = http.get(
      `${BASE_URL}/posts?published=true&tag=${randomTag()}&limit=20`,
      { tags: { op: "posts_published" } }
    );
    check(res, { "posts filtered 200": (r) => r.status === 200 });

  } else {
    // Posts d'un utilisateur
    const res = http.get(
      `${BASE_URL}/users/${randomUserId()}/posts?limit=20`,
      { tags: { op: "user_posts" } }
    );
    check(res, { "user posts ok": (r) => [200, 404].includes(r.status) });
  }

  sleep(0.1 + Math.random() * 0.2);
}
