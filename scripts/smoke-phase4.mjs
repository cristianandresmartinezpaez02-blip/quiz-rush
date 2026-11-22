// Prueba de humo de la Fase 4 contra los servidores en marcha (npm run dev):
// juega el quiz de demostración con los 14 tipos de pregunta en modo Jefe final, con power-ups,
// votación de la pregunta abierta y dibujo en vivo. Autenticación real (sesión web → JWT → JWKS).
// Uso: node scripts/smoke-phase4.mjs
import { io } from 'socket.io-client';

const WEB = 'http://localhost:3000';
const RT = process.env.REALTIME_URL ?? 'http://localhost:4000';
let failures = 0;

function check(name, cond, extra = '') {
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
}

function web() {
  const jar = new Map();
  return async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(WEB + path, {
      method,
      redirect: 'manual',
      headers: {
        origin: WEB,
        ...(body && { 'content-type': 'application/json' }),
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
      },
      body: body ? JSON.stringify(body) : undefined,
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

const sock = () =>
  new Promise((resolve, reject) => {
    const s = io(RT, { transports: ['websocket'], forceNew: true, reconnection: false });
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });

// El script emite más rápido que una persona: si salta el límite de frecuencia, reintenta
async function call(s, event, ...args) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await callOnce(s, event, ...args);
    } catch (err) {
      if (err.message !== 'RATE_LIMITED' || attempt >= 10) throw err;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

const callOnce = (s, event, ...args) =>
  new Promise((resolve, reject) =>
    s
      .timeout(8000)
      .emit(event, ...args, (err, res) =>
        err ? reject(err) : res.ok ? resolve(res.data) : reject(new Error(res.error)),
      ),
  );

const next = (s, event, match = () => true, ms = 15_000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${event}`)), ms);
    const h = (d) => {
      if (!match(d)) return;
      clearTimeout(timer);
      s.off(event, h);
      resolve(d);
    };
    s.on(event, h);
  });

const EXPECTED_EXTRA = {
  ORDER: 'order',
  MATCH: 'match',
  SLIDER: 'slider',
  PIN: 'pin',
  FILL_BLANK: 'blanks',
  REVEAL_IMAGE: 'reveal',
  WORD_CLOUD: 'cloud',
  OPEN_VOTE: 'vote',
  DRAW: 'draw',
};

const sockets = [];
try {
  // Recursos originales del quiz de demostración
  for (const f of ['/demo/isla.svg', '/demo/planeta.svg', '/demo/pitidos.wav'])
    check(`Recurso de demostración ${f}`, (await fetch(WEB + f)).status === 200);

  const host = web();
  await host('/api/auth/sign-in/email', {
    method: 'POST',
    body: { email: 'demo@quizrush.dev', password: 'QuizRush123!' },
  });
  const token = (await host('/api/auth/token')).json?.token;
  const lib = await host('/api/library?q=tour');
  const quiz = lib.json.items.find((i) => i.title.startsWith('Tour de Quiz_Rush'));
  check('El quiz de los 14 tipos está publicado en la Biblioteca', !!quiz);
  const created = await host('/api/games', { method: 'POST', body: { quizId: quiz.id } });
  const gameId = created.json.gameId;
  check(
    'Página del editor del quiz (tipos nuevos)',
    (await host(`/crear/${quiz.id}`)).status === 200,
  );

  const h = await sock();
  sockets.push(h);
  const snap = await call(h, 'host:join', { gameId, authToken: token });
  const s = await call(h, 'host:settings', { mode: 'BOSS', powerUps: true });
  check('Elegir modo Jefe final en la sala', s.mode === 'BOSS' && s.powerUps === true);

  const players = [];
  for (const [nick, avatar] of [
    ['Ana', '🦊'],
    ['Beto', '🐼'],
    ['Caro', '🐙'],
  ]) {
    const p = await sock();
    sockets.push(p);
    const j = await call(p, 'player:join', { pin: snap.pin, nickname: nick, avatar });
    players.push({ s: p, id: j.playerId, nick });
  }

  // Al empezar: cada jugador recibe sus 3 power-ups
  const metas = players.map((p) => next(p.s, 'player:meta'));
  const firstQ = next(players[0].s, 'phase', (d) => d.phase === 'getReady');
  await call(h, 'host:start');
  await firstQ;
  const dealt = await Promise.all(metas);
  check(
    'Cada jugador recibe 3 power-ups distintos',
    dealt.every((m) => m.powerUps?.length === 3 && new Set(m.powerUps).size === 3),
  );

  for (let i = 0; i < snap.questionCount; i++) {
    if (i > 0) {
      const ready = next(h, 'phase', (d) => d.phase === 'getReady' && d.qIndex === i);
      await call(h, 'host:next'); // → ranking
      await call(h, 'host:next'); // → siguiente pregunta
      await ready;
    }
    const open = next(h, 'phase', (d) => d.phase === 'question' && d.qIndex === i);
    await call(h, 'host:skip');
    const { question: q } = await open;
    const want = EXPECTED_EXTRA[q.type];
    check(
      `Pregunta ${i + 1} (${q.type}) llega sin revelar la respuesta`,
      (!want || q.extra?.kind === want) && !JSON.stringify(q).includes('isCorrect'),
    );

    if (q.type === 'AUDIO' || q.type === 'REVEAL_IMAGE')
      check(`${q.type} trae su archivo multimedia`, !!q.media?.url, q.media?.url ?? 'sin media');

    // Algunas respuestas por tipo
    const [a, b, c] = players;
    if (q.type === 'MULTIPLE_CHOICE') {
      // Power-up de pista (si a Ana le tocó)
      if (dealt[0].powerUps.includes('hint')) {
        const r = await call(a.s, 'player:powerup', { qIndex: i, type: 'hint' });
        check(
          'Power-up de pista muestra la pista del autor',
          r.hint === 'Tiene una Gran Mancha Roja',
        );
      }
      const jupiter = q.options.find((o) => o.text === 'Júpiter');
      await call(a.s, 'player:answer', { qIndex: i, optionIds: [jupiter.id] });
      await call(b.s, 'player:answer', { qIndex: i, optionIds: [jupiter.id] });
    } else if (q.type === 'ORDER') {
      const byText = (t) => q.extra.items.find((x) => x.text.includes(t)).id;
      const ok = await call(a.s, 'player:answer', {
        qIndex: i,
        order: ['Hormiga', 'Gato', 'Caballo', 'Elefante'].map(byText),
      });
      check('Ordenar: respuesta aceptada', ok.received === true);
    } else if (q.type === 'MATCH') {
      const tokenOf = (t) => q.extra.right.find((x) => x.text === t).id;
      const leftOf = (t) => q.extra.left.find((x) => x.text === t).id;
      await call(a.s, 'player:answer', {
        qIndex: i,
        pairs: {
          [leftOf('Francia')]: tokenOf('París'),
          [leftOf('Italia')]: tokenOf('Roma'),
          [leftOf('Perú')]: tokenOf('Lima'),
          [leftOf('Egipto')]: tokenOf('El Cairo'),
        },
      });
    } else if (q.type === 'SLIDER') {
      await call(a.s, 'player:answer', { qIndex: i, value: 100 });
      await call(b.s, 'player:answer', { qIndex: i, value: 150 });
    } else if (q.type === 'PIN') {
      await call(a.s, 'player:answer', { qIndex: i, point: { x: 75, y: 26 } });
    } else if (q.type === 'FILL_BLANK') {
      await call(a.s, 'player:answer', { qIndex: i, blanks: ['Oxigeno'] });
    } else if (q.type === 'WORD_CLOUD') {
      const cloud = next(h, 'cloud:update', (d) => d.words.length > 0);
      await call(a.s, 'player:answer', { qIndex: i, words: ['divertido'] });
      await call(b.s, 'player:answer', { qIndex: i, words: ['Divertido', 'rápido'] });
      check('Nube de palabras en vivo en la pantalla', (await cloud).words[0][0] === 'divertido');
    } else if (q.type === 'OPEN_VOTE') {
      await call(a.s, 'player:answer', { qIndex: i, text: 'Aprender jugando' });
      await call(b.s, 'player:answer', { qIndex: i, text: 'Juntos llegamos lejos' });
      const vote = next(h, 'phase', (d) => d.phase === 'vote');
      await call(h, 'host:skip');
      const { candidates } = await vote;
      check('La pregunta abierta pasa a votación', candidates.length === 2);
      const target = candidates.find((x) => x.text === 'Aprender jugando');
      await call(c.s, 'player:vote', { qIndex: i, candidateId: target.id });
    } else if (q.type === 'DRAW') {
      const drawer = q.extra.drawer;
      const artist = players.find((p) => p.id === drawer.id);
      const guesser = players.find((p) => p.id !== drawer.id);
      const seen = next(h, 'draw:stroke');
      artist.s.emit('draw:stroke', {
        qIndex: i,
        stroke: { c: '#e5484d', w: 10, p: [100, 100, 400, 400] },
      });
      check('El trazo del dibujo llega a la pantalla', (await seen).stroke.c === '#e5484d');
      const wrong = await call(guesser.s, 'player:answer', { qIndex: i, text: 'zzz' });
      check('Adivinar mal deja seguir intentando', wrong.received === false);
    }

    const reveal = next(h, 'phase', (d) => d.phase === 'reveal' && d.qIndex === i);
    await call(h, 'host:skip').catch(() => {}); // puede haberse cerrado sola
    const r = await reveal;
    if (q.type === 'SLIDER')
      check('Deslizador: histograma y media', r.reveal.extra.average === 125);
    if (q.type === 'OPEN_VOTE')
      check(
        'La respuesta más votada encabeza',
        r.reveal.extra.answers[0].text === 'Aprender jugando',
      );
    if (q.type === 'PIN') check('Pin: acierto cerca del faro', r.reveal.correctCount === 1);
    if (q.type === 'FILL_BLANK')
      check('Completar: se aceptan variantes sin tilde', r.reveal.correctCount === 1);
    if (i === 0) {
      check(
        'El jefe recibe daño con los aciertos',
        r.modeState.mode === 'BOSS' &&
          r.modeState.hp < r.modeState.maxHp &&
          r.modeState.lastDamage > 0,
        `${r.modeState.hp}/${r.modeState.maxHp}`,
      );
    }
  }

  const pod = next(h, 'phase', (d) => d.phase === 'podium');
  await call(h, 'host:next');
  const podium = (await pod).podium;
  check('Podio del modo Jefe final', podium.mode === 'BOSS' && podium.modeState?.mode === 'BOSS');
} catch (err) {
  check('Sin errores inesperados', false, err.message);
} finally {
  sockets.forEach((s) => s.disconnect());
}

console.log(
  failures ? `\n❌ ${failures} comprobaciones fallaron` : '\n✅ Todas las comprobaciones pasaron',
);
process.exit(failures ? 1 : 0);
