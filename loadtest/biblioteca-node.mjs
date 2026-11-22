// Generador de carga de la Biblioteca en Node: el MISMO escenario que loadtest/biblioteca.js
// (k6), para medir en una sola máquina Windows, donde k6 dentro de Docker queda limitado por el
// puente de red de Docker Desktop. En un entorno real, usar k6 desde otra máquina.
//
// Cada usuario virtual: 55 % búsqueda en el API (30 % pasa a la página 2), 25 % ficha de quiz,
// 20 % portada de la Biblioteca; espera 3-8 s entre acciones. Usa varios procesos (uno por cada
// 2.500 usuarios) para que el generador no sea el cuello de botella.
//
// Uso: node loadtest/biblioteca-node.mjs [usuarios=10000] [subida_s=120] [meseta_s=180]
//      BASES=http://localhost:3101,http://localhost:3102 (varias réplicas: reparto por usuario)
import cluster from 'node:cluster';
import http from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';

const USERS = Number(process.argv[2] ?? 10000);
const RAMP_S = Number(process.argv[3] ?? 120);
const HOLD_S = Number(process.argv[4] ?? 180);
const BASES = (process.env.BASES ?? 'http://localhost:3000').split(',');
const PER_WORKER = 2500;

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (cluster.isPrimary) {
  const workers = Math.max(1, Math.ceil(USERS / PER_WORKER));
  const ids = await fetch(`${BASES[0]}/api/library?limit=48`)
    .then((r) => r.json())
    .then((d) => d.items.map((q) => q.id));
  if (!ids.length) throw new Error('No hay quizzes (¿npm run db:seed?)');
  console.log(
    `📚 ${USERS} usuarios en ${workers} procesos → ${BASES.join(' + ')} · subida ${RAMP_S}s · meseta ${HOLD_S}s`,
  );

  const all = { api: [], pagina: [], biblioteca: [], ficha: [], total: 0, errors: {}, holdReqs: 0 };
  let done = 0;
  const started = Date.now();
  const tick = setInterval(() => {
    process.stdout.write(`\r   ${Math.round((Date.now() - started) / 1000)}s…`);
  }, 5000);
  await new Promise((resolve) => {
    for (let w = 0; w < workers; w++) {
      const worker = cluster.fork({
        WORKER_INDEX: String(w),
        WORKER_USERS: String(Math.min(PER_WORKER, USERS - w * PER_WORKER)),
        IDS: JSON.stringify(ids),
      });
      worker.on('message', (m) => {
        for (const k of ['api', 'pagina', 'biblioteca', 'ficha']) all[k].push(...m[k]);
        all.total += m.total;
        all.holdReqs += m.holdReqs;
        for (const [e, n] of Object.entries(m.errors)) all.errors[e] = (all.errors[e] ?? 0) + n;
        if (++done === workers) resolve();
      });
    }
  });
  clearInterval(tick);
  const stats = (arr) => {
    const s = arr.sort((a, b) => a - b);
    const p = (q) =>
      s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]) : null;
    return { n: s.length, p50: p(0.5), p90: p(0.9), p95: p(0.95), p99: p(0.99), max: p(1) };
  };
  const errorCount = Object.values(all.errors).reduce((a, b) => a + b, 0);
  const report = {
    fecha: new Date().toISOString(),
    usuarios: USERS,
    replicasWeb: BASES.length,
    subidaS: RAMP_S,
    mesetaS: HOLD_S,
    peticiones: all.total,
    peticionesPorSegundoEnMeseta: Math.round(all.holdReqs / HOLD_S),
    errores: all.errors,
    tasaError: `${((errorCount / Math.max(1, all.total)) * 100).toFixed(2)} %`,
    latenciaMs: {
      api: stats(all.api),
      paginas: stats(all.pagina),
      biblioteca: stats(all.biblioteca),
      fichaQuiz: stats(all.ficha),
    },
    objetivos: {
      'API p95 < 500 ms': stats(all.api).p95 < 500,
      'Páginas p95 < 1500 ms': stats(all.pagina).p95 < 1500,
      'Errores < 1 %': errorCount / Math.max(1, all.total) < 0.01,
    },
  };
  console.log('\n' + JSON.stringify(report, null, 2));
  mkdirSync('docs/carga', { recursive: true });
  writeFileSync(
    `docs/carga/biblioteca-${USERS}-${BASES.length}rep.json`,
    JSON.stringify(report, null, 2),
  );
  process.exit(0);
} else {
  const index = Number(process.env.WORKER_INDEX);
  const users = Number(process.env.WORKER_USERS);
  const ids = JSON.parse(process.env.IDS);
  const agents = BASES.map(() => new http.Agent({ keepAlive: true, maxSockets: Infinity }));
  const res = { api: [], pagina: [], biblioteca: [], ficha: [], total: 0, errors: {}, holdReqs: 0 };
  const t0 = Date.now();
  const holdStart = t0 + RAMP_S * 1000;
  const end = holdStart + HOLD_S * 1000;

  function get(base, agent, path, headers) {
    return new Promise((resolve) => {
      const t = performance.now();
      const req = http.get(base + path, { agent, headers, timeout: 30_000 }, (r) => {
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => {
          const ms = performance.now() - t;
          res.total++;
          if (Date.now() >= holdStart && Date.now() < end) res.holdReqs++;
          if (r.statusCode !== 200)
            res.errors[`HTTP ${r.statusCode}`] = (res.errors[`HTTP ${r.statusCode}`] ?? 0) + 1;
          resolve({ ms, status: r.statusCode, body: Buffer.concat(chunks) });
        });
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', (e) => {
        res.total++;
        res.errors[e.code ?? e.message] = (res.errors[e.code ?? e.message] ?? 0) + 1;
        resolve({ ms: performance.now() - t, status: 0, body: null });
      });
    });
  }

  async function user(u) {
    const globalU = index * PER_WORKER + u;
    // Entrada escalonada durante la subida
    await sleep((globalU / USERS) * RAMP_S * 1000);
    const b = globalU % BASES.length;
    const base = BASES[b];
    const agent = agents[b];
    const ip = `10.${(globalU >> 16) & 255}.${(globalU >> 8) & 255}.${globalU & 255}`;
    const apiH = { 'x-real-ip': ip, accept: '*/*', 'sec-fetch-dest': 'empty' };
    const pageH = {
      'x-real-ip': ip,
      accept: 'text/html,application/xhtml+xml',
      'sec-fetch-dest': 'document',
    };
    while (Date.now() < end) {
      const r = Math.random();
      if (r < 0.55) {
        const q = pick(TEXTOS);
        const cat = pick(CATEGORIAS);
        const path = `/api/library?q=${encodeURIComponent(q)}${cat ? `&category=${cat}` : ''}${q ? '' : `&sort=${pick(ORDEN)}`}`;
        const x = await get(base, agent, path, apiH);
        res.api.push(x.ms);
        if (x.status === 200 && Math.random() < 0.3) {
          const next = JSON.parse(x.body.toString()).nextCursor;
          if (next) {
            await sleep(1000 + Math.random() * 2000);
            res.api.push(
              (await get(base, agent, `${path}&cursor=${encodeURIComponent(next)}`, apiH)).ms,
            );
          }
        }
      } else if (r < 0.8) {
        const x = await get(base, agent, `/quiz/${pick(ids)}`, pageH);
        res.pagina.push(x.ms);
        res.ficha.push(x.ms);
      } else {
        const x = await get(base, agent, '/biblioteca', pageH);
        res.pagina.push(x.ms);
        res.biblioteca.push(x.ms);
      }
      await sleep(3000 + Math.random() * 5000);
    }
  }

  await Promise.all(Array.from({ length: users }, (_, u) => user(u)));
  process.send(res, () => process.exit(0));
}
