// Prueba de humo de la Fase 8 contra los servidores en marcha (npm run dev + db:seed):
// worker y trabajos internos, métricas, caché de búsquedas con versión, rankings en Redis,
// avisos a seguidores por lotes, límites por IP de confianza y buscador externo (si está activo).
// Uso: node scripts/smoke-phase8.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const WEB = 'http://localhost:3000';
const RT = 'http://localhost:4000';
const WORKER = 'http://localhost:4100';
let failures = 0;

function check(name, cond, extra = '') {
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
}

const env = readFileSync('.env', 'utf8');
const SECRET = env.match(/^JOBS_SECRET="(.+)"/m)?.[1] ?? '';

function web() {
  const jar = new Map();
  return async (path, { method = 'GET', body, headers = {} } = {}) => {
    const res = await fetch(WEB + path, {
      method,
      redirect: 'manual',
      headers: {
        origin: WEB,
        ...(body !== undefined && { 'content-type': 'application/json' }),
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text };
  };
}

async function login(email) {
  const c = web();
  const r = await c('/api/auth/sign-in/email', {
    method: 'POST',
    body: { email, password: 'QuizRush123!' },
  });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
  return c;
}

const redis = (...args) =>
  execFileSync('docker', ['exec', 'quiz-rush-redis-1', 'redis-cli', ...args], {
    encoding: 'utf8',
  }).trim();
const job = (name, body = {}, secret = SECRET) =>
  fetch(`${WEB}/api/internal/jobs/${name}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));

function guess(q) {
  const x = q.extra;
  if (x?.kind === 'order') return { order: x.items.map((i) => i.id) };
  if (x?.kind === 'match')
    return { pairs: Object.fromEntries(x.left.map((l, i) => [l.id, x.right[i].id])) };
  if (x?.kind === 'slider') return { value: x.min };
  if (x?.kind === 'pin') return { point: { x: 50, y: 50 } };
  if (x?.kind === 'blanks') return { blanks: x.parts.slice(1).map(() => 'x') };
  if (q.type === 'TYPE_ANSWER') return { text: 'respuesta' };
  return { optionIds: [q.options[0].id] };
}

try {
  // ── Worker ──
  const health = await fetch(`${WORKER}/health`)
    .then((r) => r.json())
    .catch(() => null);
  check('Worker vivo (/health)', health?.ok === true);
  check('Latido del worker en Redis', Number(redis('TTL', 'worker:heartbeat')) > 0);
  const wm = await fetch(`${WORKER}/metrics`).then((r) => r.text());
  check(
    'Worker ejecuta los periódicos (métricas)',
    /quizrush_jobs_total\{name="push",status="ok"/.test(wm),
  );
  check(
    'Programación de trabajos en BullMQ',
    Number(redis('ZCARD', 'bull:quizrush-jobs:repeat')) >= 5,
  );

  // ── Rutas internas de trabajos ──
  check('Trabajo sin secreto → 404', (await job('trending', {}, '')).status === 404);
  check(
    'Trabajo con secreto falso → 404',
    (await job('trending', {}, 'x'.repeat(SECRET.length))).status === 404,
  );
  check('Trabajo desconocido → 404', (await job('borrar-todo')).status === 404);
  const tr = await job('trending');
  check('Tendencia recalculada', tr.status === 200 && tr.json.done > 0, `${tr.json?.done} quizzes`);
  check('Limpieza diaria', (await job('cleanup')).status === 200);
  check('Cierre de ligas (idempotente)', (await job('league-close')).status === 200);

  // ── Métricas ──
  const rm = await fetch(`${RT}/metrics`).then((r) => r.text());
  check(
    'Métricas del tiempo real',
    /quizrush_socket_connections/.test(rm) && /quizrush_games_running/.test(rm),
  );
  check(
    'Métricas de la web protegidas (sin token → 404)',
    (await web()('/api/metrics')).status === 404,
  );

  // ── Caché de búsquedas con versión ──
  const v0 = Number(redis('GET', 'cache:ver:library') || 0);
  const anon = web();
  const q = `/api/library?q=historia&category=history`;
  const a1 = await anon(q);
  const keys = redis('--scan', '--pattern', `cache:library:search:v${v0}:*`);
  check(
    'Búsqueda guardada en caché (versión actual)',
    a1.status === 200 && keys.split('\n').filter(Boolean).length > 0,
  );
  await job('trending'); // recalcular la tendencia sube la versión
  check(
    'Recalcular la tendencia invalida las búsquedas',
    Number(redis('GET', 'cache:ver:library')) > v0,
  );

  // ── Límites por IP: solo cuenta la cabecera de confianza ──
  let limited = 0;
  for (let i = 0; i < 130; i++) {
    const r = await fetch(`${WEB}/api/library?sort=new&n=${i}`, {
      headers: { 'x-real-ip': '203.0.113.77', 'x-forwarded-for': `198.51.100.${i % 250}` },
    });
    if (r.status === 429) limited++;
  }
  check('Cambiar X-Forwarded-For no salta el límite', limited > 0, `${limited} respuestas 429`);
  let limitedOther = 0;
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${WEB}/api/library?sort=new&m=${i}`, {
      headers: { 'x-real-ip': `203.0.113.${100 + i}` },
    });
    if (r.status === 429) limitedOther++;
  }
  check('Otras IPs no se ven afectadas', limitedOther === 0);

  // ── Rankings en Redis ──
  const sofi = await login('sofi@quizrush.dev');
  const s = await sofi('/api/solo', { method: 'POST', body: { mode: 'RUSH' } });
  let v = s.json.view;
  let summary = null;
  for (let n = 0; n < 8 && !summary; n++) {
    const r = await sofi(`/api/solo/${s.json.id}/answer`, {
      method: 'POST',
      body: { qIndex: v.qIndex, answer: guess(v.question) },
    });
    summary = r.json.summary;
    if (!summary)
      v = r.json.next ?? (await sofi(`/api/solo/${s.json.id}/next`, { method: 'POST' })).json;
  }
  if (!summary) summary = (await sofi(`/api/solo/${s.json.id}/finish`, { method: 'POST' })).json;
  check('Rush: puesto calculado', summary.position >= 1, `puesto ${summary.position}`);
  const board1 = (await sofi('/api/rush')).json.leaderboard;
  const lbKey = redis('--scan', '--pattern', 'lb:rush:*').split('\n').filter(Boolean)[0];
  check(
    'Ranking del día guardado en un Sorted Set',
    !!lbKey && Number(redis('ZCARD', lbKey)) >= 1,
    lbKey,
  );
  check(
    'Sofi aparece en el ranking',
    board1.some((r) => r.username === 'sofi'),
  );
  // Si Redis pierde el ranking, se reconstruye igual desde PostgreSQL
  redis('DEL', lbKey, lbKey.replace(/^lb:/, 'lbc:'), lbKey.replace(/^lb:/, 'lbm:'));
  const board2 = (await sofi('/api/rush')).json.leaderboard;
  check(
    'Ranking reconstruido desde la base de datos',
    JSON.stringify(board2.map((r) => [r.username, r.score])) ===
      JSON.stringify(board1.map((r) => [r.username, r.score])),
  );

  // ── Avisos a seguidores por lotes (trabajo del worker) ──
  const demo = await login('demo@quizrush.dev');
  const demoId = (await demo('/api/auth/get-session')).json.user.id;
  const quiz = (await demo('/api/quizzes')).json.items.find((x) => x.status === 'PUBLISHED');
  const nf = await job('notify-followers', {
    authorId: demoId,
    quizId: quiz.id,
    quizTitle: 'Prueba de lotes',
  });
  check(
    'Avisos a seguidores: un lote',
    nf.status === 200 && nf.json.done >= 1 && nf.json.next === null,
    `${nf.json?.done} avisos`,
  );
  const notes = (await sofi('/api/notifications')).json.items;
  check(
    'Una seguidora recibe el aviso',
    notes.some((n) => n.type === 'NEW_QUIZ' && n.data.quizTitle === 'Prueba de lotes'),
  );
  await sofi('/api/notifications', { method: 'POST', body: {} });

  // ── Buscador externo (solo si la web lo tiene activo) ──
  const si = await job('search-index', { quizId: quiz.id });
  if (si.json?.done === 1) {
    check('Índice de búsqueda: un quiz sincronizado', true);
    const typo = await anon('/api/library?q=sistema%20solr');
    check(
      'Búsqueda con dos errores (Meilisearch)',
      typo.json?.items?.some((x) => /Sistema Solar/.test(x.title)),
    );
  } else {
    check(
      'Sin Meilisearch: el trabajo no hace nada y no falla',
      si.status === 200 && si.json?.done === 0,
    );
  }
} catch (err) {
  console.error('💥', err);
  failures++;
}

console.log(failures ? `\n❌ ${failures} comprobaciones fallaron` : '\n✅ Fase 8 OK');
process.exit(failures ? 1 : 0);
