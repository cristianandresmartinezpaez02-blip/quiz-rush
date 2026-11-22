// Prueba de carga de la Biblioteca General con k6 (https://k6.io).
//
// Cada usuario virtual navega como una persona: busca (con y sin texto, con filtros), pasa de
// página, abre la Biblioteca y la ficha de un quiz, y espera entre 3 y 8 s entre acciones.
// Con 10.000 usuarios eso son ~1.800 peticiones por segundo.
//
// Uso (con Docker, sin instalar k6):
//   docker run --rm -i -e BASE=http://host.docker.internal:3000 -e VUS=10000 \
//     -v "%cd%/loadtest:/scripts" grafana/k6 run /scripts/biblioteca.js
// Variables: BASE (URL de la web), VUS (usuarios máximos), HOLD (duración de la meseta, p. ej. 3m).
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://host.docker.internal:3000';
const VUS = Number(__ENV.VUS || 10000);
const HOLD = __ENV.HOLD || '3m';
const RAMP = __ENV.RAMP || '2m';
// Cada usuario virtual simula una IP distinta (la pone el proxy en producción; aquí, nosotros)
const IP_HEADER = __ENV.IP_HEADER || 'x-real-ip';

export const options = {
  discardResponseBodies: true,
  scenarios: {
    biblioteca: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: RAMP, target: VUS }, // subida gradual
        { duration: HOLD, target: VUS }, // meseta
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '20s',
    },
  },
  thresholds: {
    // Objetivos: casi sin errores y búsquedas rápidas incluso en la meseta
    http_req_failed: ['rate<0.01'],
    'http_req_duration{tipo:api}': ['p(95)<500'],
    'http_req_duration{tipo:pagina}': ['p(95)<1500'],
  },
  summaryTrendStats: ['avg', 'p(50)', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const errores = new Rate('errores_funcionales');
const buscar = new Trend('t_buscar', true);
const ficha = new Trend('t_ficha_quiz', true);

const TEXTOS = [
  'capitales',
  'sistema solar',
  'historia',
  'matematicas',
  'cine',
  'animales',
  'futbol',
  'planetas',
  'capitlaes',
  '',
];
const CATEGORIAS = ['', '', '', 'science', 'history', 'geography', 'math', 'movies'];
const ORDEN = ['trending', 'popular', 'top', 'new'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/** Ids de quizzes publicados (para abrir fichas). */
export function setup() {
  const res = http.get(`${BASE}/api/library?limit=48`, { responseType: 'text' });
  const ids = res.status === 200 ? JSON.parse(res.body).items.map((q) => q.id) : [];
  if (!ids.length) throw new Error(`No hay quizzes en ${BASE} (¿npm run db:seed?)`);
  return { ids };
}

export default function (data) {
  const ip = { [IP_HEADER]: `10.${(__VU >> 16) & 255}.${(__VU >> 8) & 255}.${__VU & 255}` };
  // Cabeceras como las de un navegador: fetch del buscador vs. navegación a una página
  const headers = { ...ip, accept: '*/*', 'sec-fetch-dest': 'empty' };
  const page = { ...ip, accept: 'text/html,application/xhtml+xml', 'sec-fetch-dest': 'document' };
  const r = Math.random();

  if (r < 0.55) {
    // Búsqueda instantánea (API)
    const q = pick(TEXTOS);
    const cat = pick(CATEGORIAS);
    const url = `${BASE}/api/library?q=${encodeURIComponent(q)}${cat ? `&category=${cat}` : ''}${q ? '' : `&sort=${pick(ORDEN)}`}`;
    const res = http.get(url, {
      headers,
      tags: { tipo: 'api', name: 'GET /api/library' },
      responseType: 'text',
    });
    buscar.add(res.timings.duration);
    errores.add(!check(res, { 'búsqueda 200': (x) => x.status === 200 }));
    // A veces pasa a la página siguiente
    if (res.status === 200 && Math.random() < 0.3) {
      const next = JSON.parse(res.body).nextCursor;
      if (next) {
        sleep(1 + Math.random() * 2);
        const r2 = http.get(`${url}&cursor=${encodeURIComponent(next)}`, {
          headers,
          tags: { tipo: 'api', name: 'GET /api/library (página 2)' },
        });
        errores.add(!check(r2, { 'página 2 200': (x) => x.status === 200 }));
      }
    }
  } else if (r < 0.8) {
    // Ficha pública de un quiz (página renderizada en el servidor)
    const res = http.get(`${BASE}/quiz/${pick(data.ids)}`, {
      headers: page,
      tags: { tipo: 'pagina', name: 'GET /quiz/:id' },
    });
    ficha.add(res.timings.duration);
    errores.add(!check(res, { 'ficha 200': (x) => x.status === 200 }));
  } else {
    // Portada de la Biblioteca (secciones tipo Netflix)
    const res = http.get(`${BASE}/biblioteca`, {
      headers: page,
      tags: { tipo: 'pagina', name: 'GET /biblioteca' },
    });
    errores.add(!check(res, { 'biblioteca 200': (x) => x.status === 200 }));
  }
  sleep(3 + Math.random() * 5);
}
