// Prueba de humo de la Fase 3 (partida en vivo) contra los servidores en marcha (npm run dev).
// A diferencia de las pruebas de integración, aquí la autenticación es REAL:
// sesión web → JWT (/api/auth/token) → verificación por JWKS en el servidor de tiempo real.
// Uso: node scripts/smoke-phase3.mjs
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

const call = (s, event, ...args) =>
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

const sockets = [];
try {
  // ── Anfitrión con sesión real ──
  const host = web();
  await host('/api/auth/sign-in/email', {
    method: 'POST',
    body: { email: 'demo@quizrush.dev', password: 'QuizRush123!' },
  });
  const token = (await host('/api/auth/token')).json?.token;
  check(
    'La web emite un JWT para el servidor de tiempo real',
    typeof token === 'string' && token.split('.').length === 3,
  );
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  check(
    'El JWT no incluye el email (datos mínimos)',
    !('email' in payload) && payload.aud === 'quiz-rush-realtime',
  );

  const lib = await host('/api/library?q=matematicas');
  const quizId = lib.json.items[0].id;
  const created = await host('/api/games', { method: 'POST', body: { quizId } });
  check('Crear partida (POST /api/games)', created.status === 201 && !!created.json?.gameId);
  const gameId = created.json.gameId;
  check('Página del anfitrión', (await host(`/host/${gameId}`)).status === 200);
  check(
    'Otra persona no puede abrir la pantalla del anfitrión',
    (await web()(`/host/${gameId}`)).status === 307,
  );
  check(
    'Quiz inexistente → 404',
    (await host('/api/games', { method: 'POST', body: { quizId: 'nope' } })).status === 404,
  );

  const h = await sock();
  sockets.push(h);
  await call(h, 'host:join', { gameId, authToken: 'token-falso' }).then(
    () => check('Token falso rechazado', false),
    (e) => check('Token falso rechazado', e.message === 'UNAUTHORIZED'),
  );
  const snap = await call(h, 'host:join', { gameId, authToken: token });
  check(
    'El anfitrión entra con JWT verificado por JWKS',
    snap.phase === 'lobby' && /^\d{6}$/.test(snap.pin),
    `PIN ${snap.pin}`,
  );

  // Un jugador con cuenta (vinculado a su perfil) y otro invitado
  const sofi = web();
  await sofi('/api/auth/sign-in/email', {
    method: 'POST',
    body: { email: 'sofi@quizrush.dev', password: 'QuizRush123!' },
  });
  const sofiToken = (await sofi('/api/auth/token')).json?.token;
  const p1 = await sock();
  const p2 = await sock();
  sockets.push(p1, p2);
  const info = await call(p1, 'player:check', { pin: snap.pin });
  check(
    'Comprobar PIN antes de pedir apodo',
    info.quizTitle === 'Matemáticas mentales' && info.started === false,
  );
  const j1 = await call(p1, 'player:join', {
    pin: snap.pin,
    nickname: 'Sofi',
    avatar: '🦊',
    authToken: sofiToken,
  });
  const j2 = await call(p2, 'player:join', { pin: snap.pin, nickname: 'Invitado', avatar: '🐼' });
  check('Jugadores entran (con cuenta e invitado)', !!j1.playerId && !!j2.playerId);

  // Espectador con la clave secreta
  const screen = await sock();
  sockets.push(screen);
  const spec = await call(screen, 'spectator:join', { gameId, key: snap.spectatorKey });
  check('Pantalla de espectador', spec.playerCount === 2 && spec.spectatorKey === '');
  check(
    'Página del espectador',
    (await web()(`/pantalla/${gameId}?k=${snap.spectatorKey}`)).status === 200,
  );

  // Reacciones agrupadas hacia la pantalla
  const reacted = next(screen, 'reactions');
  p1.emit('player:react', { emoji: '🔥' });
  p2.emit('player:react', { emoji: '🔥' });
  p2.emit('player:react', { emoji: '🔥' }); // ignorada: enfriamiento de 1,5 s
  const batch = await reacted;
  check('Reacciones agrupadas y limitadas por jugador', batch['🔥'] === 2, JSON.stringify(batch));

  // Primera pregunta: contador agregado en la pantalla y resultados personales
  const q = next(p1, 'phase', (d) => d.phase === 'question');
  await call(h, 'host:start');
  const question = await q;
  const counted = next(screen, 'answers:count', (d) => d.answered === 1);
  const correct =
    question.question.options.find((o) => o.text === '144') ?? question.question.options[0];
  await call(p1, 'player:answer', { qIndex: 0, optionIds: [correct.id] });
  check('Contador de respuestas en la pantalla (agrupado)', (await counted).answered === 1);
  const r1 = next(p1, 'player:result');
  await call(h, 'host:skip');
  const res = await r1;
  check(
    'Resultado personal tras cerrar la pregunta',
    res.correct === true && res.rank === 1 && res.points > 0,
    `+${res.points}`,
  );

  // Terminar: podio y resultados guardados en el perfil del jugador con cuenta
  const pod = next(h, 'phase', (d) => d.phase === 'podium');
  await call(h, 'host:end');
  check('Terminar la partida muestra el podio', (await pod).podium.top[0].nick === 'Sofi');
  await new Promise((r) => setTimeout(r, 1500));
  const quizPage = await web()(`/quiz/${quizId}`);
  check('El ranking del quiz muestra la partida', quizPage.text.includes('Sofi'));
} catch (err) {
  check('Sin errores inesperados', false, err.message);
} finally {
  sockets.forEach((s) => s.disconnect());
}

console.log(
  failures ? `\n❌ ${failures} comprobaciones fallaron` : '\n✅ Todas las comprobaciones pasaron',
);
process.exit(failures ? 1 : 0);
