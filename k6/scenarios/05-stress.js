/**
 * Scénario 05 – Stress Test
 * Objectif : trouver le point de rupture de chaque implémentation
 * en montant progressivement la charge jusqu'à 200 VUs.
 *
 * Ce scénario révèle comment ORM et SQL natif se comportent
 * lorsque le pool de connexions est sous pression.
 */
import http  from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";
import { BASE_URL, randomUserId, randomPostId, randomTag } from "../config.js";

const errorRate = new Rate("error_rate");

export const options = {
  stages: [
    { duration: "1m",  target: 50  },
    { duration: "1m",  target: 100 },
    { duration: "1m",  target: 150 },
    { duration: "2m",  target: 200 },
    { duration: "1m",  target: 200 },
    { duration: "1m",  target: 0   },
  ],
  thresholds: {
    // Seuils souples : l'objectif est d'observer la dégradation, pas de passer
    "http_req_failed": ["rate<0.10"],
    "error_rate":      ["rate<0.10"],
  },
};

export default function () {
  const roll = Math.random();
  let res;

  if (roll < 0.40) {
    res = http.get(`${BASE_URL}/users/${randomUserId()}`);
  } else if (roll < 0.60) {
    res = http.get(`${BASE_URL}/posts/${randomPostId()}`);
  } else if (roll < 0.75) {
    res = http.get(`${BASE_URL}/posts?limit=20&page=${Math.floor(Math.random() * 30) + 1}`);
  } else if (roll < 0.88) {
    res = http.get(`${BASE_URL}/posts/search/by-tag/${randomTag()}`);
  } else {
    res = http.get(`${BASE_URL}/users/${randomUserId()}/posts`);
  }

  const ok = res.status >= 200 && res.status < 500;
  errorRate.add(!ok);
  check(res, { "status not 5xx": () => ok });

  sleep(0.05);
}
