// Reindexa todos los quizzes publicados en Meilisearch (la primera vez o tras cambiar ajustes).
// Requiere la web en marcha y MEILI_URL + JOBS_SECRET en .env.
// Uso: npm run search:reindex
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
if (!env.MEILI_URL) {
  console.error(
    'MEILI_URL está vacío en .env: la búsqueda usa PostgreSQL y no hay nada que indexar.',
  );
  process.exit(1);
}
const web = env.WEB_INTERNAL_URL || 'http://localhost:3000';
const res = await fetch(`${web}/api/internal/jobs/search-index`, {
  method: 'POST',
  headers: { authorization: `Bearer ${env.JOBS_SECRET}`, 'content-type': 'application/json' },
  body: JSON.stringify({ all: true }),
});
if (!res.ok) {
  console.error(`La web respondió ${res.status}. ¿Está en marcha y con el mismo JOBS_SECRET?`);
  process.exit(1);
}
const { done } = await res.json();
console.log(`✓ ${done} quizzes indexados en Meilisearch`);
