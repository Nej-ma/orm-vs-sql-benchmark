/**
 * Configuration partagée pour tous les scénarios k6
 * Les URLs cibles sont passées via les variables d'environnement :
 *   BASE_URL  (ex: http://localhost:3001 ou http://localhost:3002)
 */
export const BASE_URL = __ENV.BASE_URL || "http://localhost:3001";

// Seuils communs à tous les scénarios
export const COMMON_THRESHOLDS = {
  http_req_failed:   ["rate<0.01"],    // < 1% d'erreurs
  http_req_duration: ["p(95)<2000"],   // P95 < 2 s
};

// IDs valides dans notre dataset (utilisateurs 1 à 10000, posts 1 à 30000)
export function randomUserId()  { return Math.floor(Math.random() * 9000) + 500; }
export function randomPostId()  { return Math.floor(Math.random() * 28000) + 500; }
export function randomPage()    { return Math.floor(Math.random() * 50) + 1; }

export const TAG_SLUGS = [
  "javascript", "typescript", "nodejs", "python", "docker",
  "postgresql", "redis", "graphql", "rest-api", "performance",
  "security", "devops", "machine-learning", "react", "vuejs",
  "architecture", "testing", "microservices", "cloud", "open-source",
];

export function randomTag() {
  return TAG_SLUGS[Math.floor(Math.random() * TAG_SLUGS.length)];
}
