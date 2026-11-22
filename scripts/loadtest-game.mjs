// Prueba de carga de una partida en vivo: N jugadores (por defecto 2.000) en UNA sala.
//
// Mide lo que siente un jugador:
//  • unirse: % de éxito y latencia (p50/p95/p99),
//  • reparto de la pregunta: cuánto tarda en llegar a cada jugador desde que la recibe el primero,
//  • responder: latencia de la confirmación del servidor (ack),
//  • resultados: cuántos reciben su resultado personal al cerrar la pregunta.
// Y del servidor: /metrics del tiempo real (antes y después) y la memoria del generador.
//
// Cada jugador simula un cliente distinto enviando su IP en la cabecera de confianza
// (CLIENT_IP_HEADER, x-real-ip): en producción la pone el proxy, aquí la ponemos nosotros.
//
// Uso: node scripts/loadtest-game.mjs [jugadores=2000] [por-segundo=150] [preguntas=3]
//      RT_URL=http://localhost:4000 WEB_URL=http://localhost:3000 (por defecto)
import { mkdirSync, writeFileSync } from 'node:fs';
import { io } from 'socket.io-client';

const PLAYERS = Number(process.argv[2] ?? 2000);
const PER_SECOND = Number(process.argv[3] ?? 150);
const QUESTIONS = Number(process.argv[4] ?? 3);
// Varias instancias: RT_URLS=http://localhost:4000,http://localhost:4001 (jugadores repartidos;
// el anfitrión en la primera). Así se prueba el reparto entre instancias a través de Redis.
const RT_URLS = (process.env.RT_URLS ?? process.env.RT_URL ?? 'http://localhost:4000').split(',');
const RT = RT_URLS[0];
const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const IP_HEADER = process.env.CLIENT_IP_HEADER ?? 'x-real-ip';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]);
};
const stats = (arr) => ({
  n: arr.length,
  p50: pct(arr, 50),
  p95: pct(arr, 95),
  p99: pct(arr, 99),
  max: pct(arr, 100),
});

function web() {
  const jar = new Map();
  return async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(WEB + path, {
      method,
      headers: {
        origin: WEB,
        ...(body !== undefined && { 'content-type': 'application/json' }),
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return res.json().catch(() => null);
  };
}

/** Emite un evento con confirmación (los eventos del anfitrión no llevan datos, solo el ack). */
const call = (s, event, ...args) =>
  new Promise((resolve, reject) =>
    s
      .timeout(15_000)
      .emit(event, ...args, (err, res) =>
        err ? reject(err) : res.ok ? resolve(res.data) : reject(new Error(res.error)),
      ),
  );

async function rtMetrics() {
  const texts = await Promise.all(
    RT_URLS.map((u) =>
      fetch(`${u}/metrics`)
        .then((r) => r.text())
        .catch(() => ''),
    ),
  );
  const sum = (re) => texts.reduce((acc, t) => acc + Number(t.match(re)?.[1] ?? 0), 0);
  return {
    instancias: RT_URLS.length,
    connections: sum(/^quizrush_socket_connections\{[^}]*\} (\d+)/m),
    answerAcks: sum(
      /^quizrush_socket_events_total\{event="player:answer",result="ok"[^}]*\} (\d+)/m,
    ),
    rssMb: Math.round(sum(/^process_resident_memory_bytes\{[^}]*\} ([\d.e+]+)/m) / 1e6),
  };
}

console.log(
  `🎮 Prueba de carga: ${PLAYERS} jugadores, ${PER_SECOND}/s, ${QUESTIONS} preguntas → ${RT_URLS.join(' + ')}`,
);
const host = web();
await host('/api/auth/sign-in/email', {
  method: 'POST',
  body: { email: 'demo@quizrush.dev', password: 'QuizRush123!' },
});
const lib = await host('/api/library?q=capitales');
const quiz = lib?.items?.[0];
if (!quiz) throw new Error('No se encontró el quiz «Capitales» (¿npm run db:seed?)');
const { gameId } = await host('/api/games', {
  method: 'POST',
  body: { quizId: quiz.id, settings: { maxPlayers: 2000 } },
});
const { token } = await host('/api/auth/token');

const hostSocket = io(RT, { transports: ['websocket'], forceNew: true, reconnection: false });
await new Promise((r) => hostSocket.once('connect', r));
const snap = await call(hostSocket, 'host:join', { gameId, authToken: token });
console.log(`   Partida ${gameId} · PIN ${snap.pin} · quiz «${quiz.title}»`);

const before = await rtMetrics();
const joinMs = [];
const joinErrors = {};
const players = [];
let disconnects = 0;
let currentQ = -1;
const fanout = []; // por jugador: ms desde que el PRIMER cliente recibió la pregunta
let arrivals = [];
let hostArrival = 0;
const answerMs = [];
const answerErrors = {};
const results = new Map(); // qIndex → recibidos

function addPlayer(i) {
  return new Promise((resolve) => {
    const s = io(RT_URLS[i % RT_URLS.length], {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: { [IP_HEADER]: `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}` },
    });
    const p = { s, joined: false };
    s.on('disconnect', () => p.joined && disconnects++);
    s.on('phase', (d) => {
      if (d.phase !== 'question' || !d.question) return;
      if (d.question.index !== undefined && d.question.index !== currentQ) return;
      arrivals.push(Date.now());
      const opts = d.question.options ?? [];
      // Opciones: una al azar · respuesta escrita: texto · otros tipos: no responde
      const answer = opts.length
        ? { optionIds: [opts[Math.floor(Math.random() * opts.length)].id] }
        : d.question.type === 'TYPE_ANSWER'
          ? { text: Math.random() < 0.5 ? 'Canberra' : 'Sídney' }
          : null;
      if (!answer) return;
      // Responde entre 0,3 y 4 s después, como una persona
      setTimeout(
        async () => {
          const t = Date.now();
          try {
            await call(s, 'player:answer', { qIndex: currentQ, ...answer });
            answerMs.push(Date.now() - t);
          } catch (err) {
            answerErrors[err.message] = (answerErrors[err.message] ?? 0) + 1;
          }
        },
        300 + Math.random() * 3700,
      );
    });
    s.on('player:result', () => results.set(currentQ, (results.get(currentQ) ?? 0) + 1));
    s.once('connect', async () => {
      const t = Date.now();
      try {
        await call(s, 'player:join', { pin: snap.pin, nickname: `Carga${i}`, avatar: '🦊' });
        joinMs.push(Date.now() - t);
        p.joined = true;
      } catch (err) {
        joinErrors[err.message] = (joinErrors[err.message] ?? 0) + 1;
      }
      resolve();
    });
    s.once('connect_error', (err) => {
      joinErrors[`connect:${err.message}`] = (joinErrors[`connect:${err.message}`] ?? 0) + 1;
      resolve();
    });
    players.push(p);
  });
}

// ── Entrada escalonada ──
const tJoin = Date.now();
const pending = [];
for (let i = 0; i < PLAYERS; i++) {
  pending.push(addPlayer(i));
  if ((i + 1) % PER_SECOND === 0) {
    await sleep(1000);
    process.stdout.write(`\r   Conectados ${i + 1}/${PLAYERS}…`);
  }
}
await Promise.all(pending);
const joined = players.filter((p) => p.joined).length;
if (!joined) {
  console.error('\n   Nadie pudo unirse:', joinErrors);
  process.exit(1);
}
console.log(
  `\r   ✓ ${joined}/${PLAYERS} dentro en ${((Date.now() - tJoin) / 1000).toFixed(1)} s        `,
);

// ── Preguntas ──
// Fase actual vista por el anfitrión (la pregunta puede cerrarse sola si todos responden)
let hostPhase = 'lobby';
hostSocket.on('phase', (d) => {
  hostPhase = d.phase;
  if (d.phase === 'question') hostArrival = Date.now();
});

const waitPhase = (phase, ms = 30_000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout fase ${phase}`)), ms);
    const h = (d) => {
      if (d.phase !== phase) return;
      clearTimeout(t);
      hostSocket.off('phase', h);
      resolve(d);
    };
    hostSocket.on('phase', h);
  });

const perQuestion = [];
for (let q = 0; q < QUESTIONS; q++) {
  currentQ = q;
  const answeredBefore = answerMs.length;
  arrivals = [];
  hostArrival = 0;
  const isQ = waitPhase('question');
  if (q === 0) await call(hostSocket, 'host:start');
  else await call(hostSocket, 'host:next');
  await isQ;
  // Espera a que respondan (o 6 s), luego cierra la pregunta
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline && answerMs.length - answeredBefore < joined * 0.97)
    await sleep(100);
  if (hostPhase === 'question') {
    const reveal = waitPhase('reveal');
    await call(hostSocket, 'host:skip').catch((err) => {
      if (err.message !== 'NOTHING_TO_SKIP') throw err;
    });
    if (hostPhase !== 'reveal') await reveal;
  }
  await sleep(1500); // entrega de resultados personales
  const first = Math.min(hostArrival || Infinity, ...arrivals);
  for (const t of arrivals) fanout.push(t - first);
  perQuestion.push({
    pregunta: q + 1,
    recibieron: arrivals.length,
    respondieron: answerMs.length - answeredBefore,
    resultados: results.get(q) ?? 0,
  });
  console.log(
    `   Pregunta ${q + 1}: llegó a ${arrivals.length}, respondieron ${answerMs.length - answeredBefore}, resultados ${results.get(q) ?? 0}`,
  );
  if (q < QUESTIONS - 1) {
    // reveal → leaderboard → (siguiente) question
    const lb = waitPhase('leaderboard');
    await call(hostSocket, 'host:next');
    await lb;
  }
}

const after = await rtMetrics();
await call(hostSocket, 'host:end').catch(() => {});
await sleep(1000);

const report = {
  fecha: new Date().toISOString(),
  jugadores: PLAYERS,
  dentro: joined,
  exitoUnirse: `${((joined / PLAYERS) * 100).toFixed(1)} %`,
  unirseMs: stats(joinMs),
  erroresUnirse: joinErrors,
  repartoPreguntaMs: stats(fanout),
  respuestaAckMs: stats(answerMs),
  erroresRespuesta: answerErrors,
  desconexiones: disconnects,
  porPregunta: perQuestion,
  servidor: {
    instancias: after.instancias,
    conexionesAlFinal: after.connections,
    respuestasConfirmadas: after.answerAcks - before.answerAcks,
    memoriaMb: { antes: before.rssMb, despues: after.rssMb },
  },
  generadorMb: Math.round(process.memoryUsage().rss / 1e6),
};
console.log(JSON.stringify(report, null, 2));
mkdirSync('docs/carga', { recursive: true });
writeFileSync(
  `docs/carga/partida-${PLAYERS}-${RT_URLS.length}inst.json`,
  JSON.stringify(report, null, 2),
);

for (const p of players) p.s.disconnect();
hostSocket.disconnect();
process.exit(0);
