// Prueba de humo de la Fase 7 contra los servidores en marcha (npm run dev + db:seed):
// amigos, bloqueos, presencia, invitación a una partida en vivo, clubes y su ranking,
// notificaciones (y su envío push), compartir resultados, PWA, accesibilidad y administración.
// Uso: node scripts/smoke-phase7.mjs
import { execFileSync } from 'node:child_process';
import { createECDH, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { io } from 'socket.io-client';

const WEB = 'http://localhost:3000';
const RT = 'http://localhost:4000';
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
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text, headers: res.headers };
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

/** Consulta de solo lectura a Postgres (para comprobar el repartidor de push). */
function sql(query) {
  const env = readFileSync('.env', 'utf8');
  const url = new URL(env.match(/^DIRECT_DATABASE_URL="?([^"\n]+)"?/m)?.[1] ?? '');
  return execFileSync(
    'docker',
    [
      'exec',
      '-e',
      `PGPASSWORD=${decodeURIComponent(url.password)}`,
      'quiz-rush-postgres-1',
      'psql',
      '-U',
      decodeURIComponent(url.username),
      '-d',
      url.pathname.slice(1),
      '-tAc',
      query,
    ],
    { encoding: 'utf8' },
  ).trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

const sockets = [];
try {
  const [demo, sofi, leo, juli, maxp, tono, admin] = await Promise.all(
    ['demo', 'sofi', 'leogamer', 'julirush', 'maxpower', 'tonoquiz', 'admin'].map((u) =>
      login(`${u}@quizrush.dev`),
    ),
  );
  const id = async (c) => (await c('/api/auth/get-session')).json.user.id;
  const [demoId, sofiId, leoId, juliId, maxId] = await Promise.all(
    [demo, sofi, leo, juli, maxp].map(id),
  );

  // ── Amigos ──
  let f = (await demo('/api/friends')).json;
  check(
    'Lista de amigos del seed (Sofi y Luna)',
    f.friends.some((x) => x.username === 'sofi') &&
      f.friends.some((x) => x.username === 'profe_luna'),
    f.friends.map((x) => x.username).join(','),
  );
  check(
    'Solicitud pendiente de Leo',
    f.incoming.some((x) => x.id === leoId),
  );
  const acc = await demo(`/api/friends/${leoId}`, { method: 'POST', body: { action: 'accept' } });
  check('Aceptar solicitud', acc.json?.status === 'friends', acc.text.slice(0, 80));
  const leoNotes = (await leo('/api/notifications')).json;
  check(
    'Leo recibe el aviso FRIEND_ACCEPTED',
    leoNotes.items.some((n) => n.type === 'FRIEND_ACCEPTED' && n.data.actorUsername === 'demo'),
  );
  check(
    'A uno mismo no → CANNOT_FRIEND_SELF',
    (await demo('/api/friends', { method: 'POST', body: { username: 'demo' } })).json?.error ===
      'CANNOT_FRIEND_SELF',
  );
  check(
    'Usuario inexistente → 404',
    (await demo('/api/friends', { method: 'POST', body: { username: 'nadie_9999' } })).status ===
      404,
  );

  const found = (await sofi('/api/friends/search?q=juli')).json;
  check(
    'Buscar personas',
    found.items?.some((x) => x.username === 'juli_rush'),
    JSON.stringify(found).slice(0, 80),
  );
  const req = await sofi('/api/friends', { method: 'POST', body: { username: 'juli_rush' } });
  check('Enviar solicitud', req.json?.status === 'outgoing', req.text.slice(0, 60));
  check(
    'Juli la ve como recibida',
    (await juli('/api/friends')).json.incoming.some((x) => x.id === sofiId),
  );
  check(
    'Rechazar',
    (await juli(`/api/friends/${sofiId}`, { method: 'POST', body: { action: 'decline' } })).json
      ?.status === 'none',
  );

  // Bloqueo: Max bloquea a Sofi → Sofi no puede pedirle amistad ni lo encuentra
  await maxp(`/api/friends/${sofiId}`, { method: 'POST', body: { action: 'block' } });
  check(
    'Bloqueada: la solicitud no llega (404)',
    (await sofi('/api/friends', { method: 'POST', body: { username: 'maxpower' } })).status === 404,
  );
  check(
    'Bloqueada: no aparece en la búsqueda',
    !(await sofi('/api/friends/search?q=maxpower')).json.items.some((x) => x.id === maxId),
  );
  check(
    'Desbloquear',
    (await maxp(`/api/friends/${sofiId}`, { method: 'POST', body: { action: 'unblock' } })).json
      ?.status === 'none',
  );

  // Privacidad: sin solicitudes
  await tono('/api/profile', { method: 'PATCH', body: { allowFriendRequests: false } });
  check(
    'Solicitudes desactivadas → FRIEND_REQUESTS_OFF',
    (await sofi('/api/friends', { method: 'POST', body: { username: 'tono_quiz' } })).json
      ?.error === 'FRIEND_REQUESTS_OFF',
  );
  await tono('/api/profile', { method: 'PATCH', body: { allowFriendRequests: true } });

  const guest = web();
  await guest('/api/auth/sign-in/anonymous', { method: 'POST', body: {} });
  check(
    'Invitado no puede añadir amigos',
    (await guest('/api/friends', { method: 'POST', body: { username: 'demo' } })).status === 403,
  );

  // ── Presencia ──
  await sofi('/api/presence', { method: 'POST', body: { activity: 'solo' } });
  f = (await demo('/api/friends')).json;
  check(
    'Presencia: Sofi aparece "jugando solo"',
    f.friends.find((x) => x.id === sofiId)?.presence?.activity === 'solo',
  );
  await sofi('/api/profile', { method: 'PATCH', body: { showOnline: false } });
  await sofi('/api/presence', { method: 'POST', body: { activity: 'online' } });
  f = (await demo('/api/friends')).json;
  check(
    'Presencia oculta si lo pide la persona',
    f.friends.find((x) => x.id === sofiId)?.presence === null,
  );
  await sofi('/api/profile', { method: 'PATCH', body: { showOnline: true } });

  // ── Push: suscripción y repartidor ──
  const push = (await sofi('/api/push')).json;
  check(
    'Push activado en el servidor (claves VAPID)',
    push.enabled === true && typeof push.publicKey === 'string',
  );
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const sub = {
    endpoint: `https://push.invalid/smoke/${randomBytes(6).toString('hex')}`,
    keys: {
      p256dh: ecdh.getPublicKey().toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    },
  };
  check(
    'Guardar suscripción',
    (await sofi('/api/push', { method: 'POST', body: sub })).status === 201,
  );

  // ── Invitar a una partida en vivo ──
  const quiz = (await demo('/api/quizzes')).json.items.find((q) => q.status === 'PUBLISHED');
  const { gameId } = (await demo('/api/games', { method: 'POST', body: { quizId: quiz.id } })).json;
  const token = (await demo('/api/auth/token')).json.token;
  const h = await sock();
  sockets.push(h);
  const snap = await call(h, 'host:join', { gameId, authToken: token });
  const inv = await demo('/api/friends/invite', {
    method: 'POST',
    body: { friendIds: [sofiId, juliId], pin: snap.pin },
  });
  check('Invitar: solo llega a amigos', inv.json?.invited === 1, inv.text.slice(0, 60));
  check(
    'Invitar sin ser amigos → 403',
    (
      await demo('/api/friends/invite', {
        method: 'POST',
        body: { friendIds: [juliId], pin: snap.pin },
      })
    ).status === 403,
  );
  check(
    'PIN inexistente → 404',
    (
      await demo('/api/friends/invite', {
        method: 'POST',
        body: { friendIds: [sofiId], pin: '000001' },
      })
    ).status === 404,
  );
  const sofiNotes = (await sofi('/api/notifications')).json;
  const invite = sofiNotes.items.find((n) => n.type === 'GAME_INVITE');
  check('Sofi recibe la invitación con el PIN', invite?.data.pin === snap.pin);

  // El repartidor marca el push como enviado (corre tras cualquier petición, cada ≤10 s)
  let pushed = '';
  for (let i = 0; i < 15 && !pushed; i++) {
    await sofi('/api/push');
    await sleep(1500);
    pushed = sql(`SELECT "pushedAt" IS NOT NULL FROM "Notification" WHERE id = '${invite.id}'`);
    if (pushed !== 't') pushed = '';
  }
  check('Repartidor de push procesa la invitación', pushed === 't');

  // ── Clubes ──
  const clubs = (await sofi('/api/clubs')).json;
  check(
    'Clubes del seed',
    clubs.discover.some((c) => c.slug === 'los-cerebritos') &&
      clubs.mine.some((c) => c.slug === 'equipo-demo'),
  );
  const priv = clubs.mine.find((c) => c.slug === 'equipo-demo');
  check(
    'Club privado: invisible para quien no es miembro',
    (await juli(`/api/clubs/${priv.id}`)).status === 404,
  );
  check(
    'Código incorrecto → 404',
    (await juli('/api/clubs/join', { method: 'POST', body: { code: 'ZZZZ2345' } })).status === 404,
  );
  check(
    'Entrar con código',
    (await juli('/api/clubs/join', { method: 'POST', body: { code: 'RUSH2345' } })).json?.slug ===
      'equipo-demo',
  );
  const joinedNote = (await demo('/api/notifications')).json.items.find(
    (n) => n.type === 'CLUB_JOINED',
  );
  check('El fundador recibe CLUB_JOINED', joinedNote?.data.clubSlug === 'equipo-demo');
  check(
    'Un miembro no puede expulsar',
    (
      await sofi(`/api/clubs/${priv.id}/members/${juliId}`, {
        method: 'POST',
        body: { action: 'kick' },
      })
    ).status === 403,
  );
  check(
    'El fundador asciende a Sofi',
    (
      await demo(`/api/clubs/${priv.id}/members/${sofiId}`, {
        method: 'POST',
        body: { action: 'promote' },
      })
    ).status === 200,
  );
  check(
    'Una admin expulsa a Juli',
    (
      await sofi(`/api/clubs/${priv.id}/members/${juliId}`, {
        method: 'POST',
        body: { action: 'kick' },
      })
    ).status === 200,
  );
  check(
    'Una admin no puede tocar al fundador',
    (
      await sofi(`/api/clubs/${priv.id}/members/${demoId}`, {
        method: 'POST',
        body: { action: 'kick' },
      })
    ).status === 403,
  );
  await demo(`/api/clubs/${priv.id}/members/${sofiId}`, {
    method: 'POST',
    body: { action: 'demote' },
  });

  const created = await juli('/api/clubs', {
    method: 'POST',
    body: { name: 'Smoke Club', emoji: '🔥', color: '#22c55e', isPublic: true },
  });
  check('Crear club', created.status === 201 && !!created.json.slug, created.text.slice(0, 80));
  const myClub = (await juli('/api/clubs')).json.mine.find((c) => c.slug === created.json.slug);
  check(
    'Añadir quiz al club',
    (await juli(`/api/clubs/${myClub.id}/quizzes`, { method: 'POST', body: { quizId: quiz.id } }))
      .status === 201,
  );
  check(
    'Entrar a un club público',
    (await maxp(`/api/clubs/${myClub.id}/membership`, { method: 'POST' })).status === 200,
  );
  const before = (await maxp(`/api/clubs/${myClub.id}`)).json.members.find(
    (m) => m.userId === maxId,
  ).points;
  // Jugar una práctica completa suma XP → puntos del club
  const s = await maxp('/api/solo', {
    method: 'POST',
    body: { mode: 'PRACTICE', quizId: quiz.id },
  });
  let v = s.json.view;
  let summary = null;
  for (let n = 0; n < 40 && !summary; n++) {
    const q = v.question;
    const answer = q.options?.length
      ? { optionIds: [q.options[0].id] }
      : q.extra?.kind === 'order'
        ? { order: q.extra.items.map((i) => i.id) }
        : q.extra?.kind === 'slider'
          ? { value: q.extra.min }
          : q.extra?.kind === 'match'
            ? { pairs: Object.fromEntries(q.extra.left.map((l, i) => [l.id, q.extra.right[i].id])) }
            : q.extra?.kind === 'pin'
              ? { point: { x: 50, y: 50 } }
              : q.extra?.kind === 'blanks'
                ? { blanks: q.extra.parts.slice(1).map(() => 'x') }
                : { text: 'x' };
    const r = await maxp(`/api/solo/${s.json.id}/answer`, {
      method: 'POST',
      body: { qIndex: v.qIndex, answer },
    });
    summary = r.json.summary;
    if (!summary)
      v = r.json.next ?? (await maxp(`/api/solo/${s.json.id}/next`, { method: 'POST' })).json;
  }
  if (!summary) summary = (await maxp(`/api/solo/${s.json.id}/finish`, { method: 'POST' })).json;
  const after = (await maxp(`/api/clubs/${myClub.id}`)).json.members.find(
    (m) => m.userId === maxId,
  ).points;
  check(
    'Jugar suma puntos al club',
    after > before,
    `${before} → ${after} (+${summary?.rewards?.xp} XP)`,
  );

  // ── Compartir resultado ──
  check('El resumen trae el id para compartir', typeof summary?.shareId === 'string');
  const page = await web()(`/resultado/${summary.shareId}`);
  check(
    'Página pública del resultado',
    page.status === 200 && page.text.includes('og:image'),
    String(page.status),
  );
  const img = await fetch(`${WEB}/resultado/${summary.shareId}/imagen`);
  check(
    'Imagen para redes (PNG)',
    img.status === 200 && img.headers.get('content-type') === 'image/png',
    `${img.status} ${img.headers.get('content-type')}`,
  );
  check('Resultado inexistente → 404', (await web()('/resultado/no-existe')).status === 404);

  // Limpieza de clubes
  check(
    'Salir del club',
    (await maxp(`/api/clubs/${myClub.id}/membership`, { method: 'DELETE' })).status === 200,
  );
  check(
    'Borrar club (fundador)',
    (await juli(`/api/clubs/${myClub.id}`, { method: 'DELETE' })).status === 200,
  );
  await juli('/api/notifications', { method: 'POST', body: {} });

  // ── Accesibilidad ──
  await demo('/api/profile', { method: 'PATCH', body: { textScale: 130, extraTimePercent: 50 } });
  const home = await demo('/');
  check('Tamaño de texto aplicado al documento', /<html[^>]*text-scale-130/.test(home.text));
  const adv = await demo('/api/solo', {
    method: 'POST',
    body: { mode: 'ADVENTURE', level: 'nature-1' },
  });
  const av = adv.json?.view;
  const ms = av ? av.endsAt - av.serverNow : 0;
  check(
    'Tiempo extra en modos individuales (+50 %)',
    av?.extraPct === 50 && ms > av.question.timeLimit * 1000 * 1.4,
    `${ms} ms para ${av?.question?.timeLimit} s`,
  );
  await demo('/api/profile', { method: 'PATCH', body: { textScale: 100, extraTimePercent: 0 } });

  // ── PWA ──
  const manifest = await fetch(`${WEB}/manifest.webmanifest`);
  const mf = await manifest.json().catch(() => ({}));
  check(
    'Manifiesto de la app',
    manifest.status === 200 &&
      mf.display === 'standalone' &&
      mf.icons?.some((i) => i.purpose === 'maskable'),
  );
  const sw = await fetch(`${WEB}/sw.js`);
  check(
    'Service worker sin caché HTTP',
    sw.status === 200 && /no-cache/.test(sw.headers.get('cache-control') ?? ''),
  );
  check('Página sin conexión', (await fetch(`${WEB}/sin-conexion`)).status === 200);
  check('Iconos', (await fetch(`${WEB}/icons/icon-512.png`)).status === 200);

  // ── Administración ──
  check('Quien no es admin no entra al panel (404)', (await demo('/admin')).status === 404);
  check('API de admin protegida (403)', (await demo('/api/admin/stats')).status === 403);
  const stats = (await admin('/api/admin/stats')).json;
  check(
    'Métricas del panel',
    typeof stats?.users === 'number' && stats.users > 5,
    JSON.stringify(stats).slice(0, 90),
  );
  sql('DELETE FROM "Report" WHERE details = \'smoke\''); // por si quedó de una ejecución anterior
  await sofi('/api/reports', {
    method: 'POST',
    body: { targetType: 'QUIZ', targetId: quiz.id, reason: 'SPAM', details: 'smoke' },
  });
  const reps = (await admin('/api/admin/reports')).json.items;
  check(
    'El reporte llega al panel',
    reps.some((g) => g.targetId === quiz.id),
  );
  check(
    'Ocultar el quiz reportado',
    (
      await admin('/api/admin/reports', {
        method: 'POST',
        body: { targetType: 'QUIZ', targetId: quiz.id, decision: 'hide' },
      })
    ).status === 200,
  );
  check('Oculto: ya no es público', (await web()(`/quiz/${quiz.id}`)).status === 404);
  check(
    'Aparece en la cola de moderación',
    (await admin('/api/admin/quizzes')).json.items.some((q) => q.id === quiz.id),
  );
  check(
    'Aprobar lo devuelve a la Biblioteca',
    (
      await admin('/api/admin/quizzes', {
        method: 'POST',
        body: { quizId: quiz.id, action: 'approve' },
      })
    ).status === 200 && (await web()(`/quiz/${quiz.id}`)).status === 200,
  );
  await demo('/api/notifications', { method: 'POST', body: {} });
  const users = (await admin('/api/admin/users?q=juli')).json.items;
  check(
    'Buscar personas en el panel',
    users.some((u) => u.id === juliId),
  );
  check(
    'Bloquear cuenta',
    (await admin('/api/admin/users', { method: 'POST', body: { userId: juliId, banned: true } }))
      .status === 200,
  );
  const bannedRes = await juli('/api/friends');
  check(
    'La cuenta bloqueada pierde el acceso al instante',
    bannedRes.status === 401 || bannedRes.json?.error === 'BANNED',
    String(bannedRes.status),
  );
  const juliLogin = await web()('/api/auth/sign-in/email', {
    method: 'POST',
    body: { email: 'julirush@quizrush.dev', password: 'QuizRush123!' },
  });
  check('Y no puede volver a entrar', juliLogin.status !== 200, String(juliLogin.status));
  check(
    'Desbloquear',
    (await admin('/api/admin/users', { method: 'POST', body: { userId: juliId, banned: false } }))
      .status === 200,
  );
  check(
    'No se puede bloquear a un admin',
    (
      await admin('/api/admin/users', {
        method: 'POST',
        body: { userId: (await admin('/api/auth/get-session')).json.user.id, banned: true },
      })
    ).status === 400,
  );
  check('Uso de la IA', Array.isArray((await admin('/api/admin/ai')).json?.items));
  // Restaurar los quizzes de Juli (bloquear los oculta y desbloquear no los vuelve a publicar)
  sql(
    `UPDATE "Quiz" SET status = 'PUBLISHED', "hiddenReason" = NULL WHERE "hiddenReason" = 'AUTHOR_BANNED' AND "authorId" = '${juliId}'`,
  );

  // ── Páginas ──
  for (const [c, path] of [
    [demo, '/amigos'],
    [demo, '/clubes'],
    [demo, '/clubes/los-cerebritos'],
    [demo, '/clubes/equipo-demo'],
    [demo, '/notificaciones'],
    [demo, '/ajustes'],
    [admin, '/admin'],
  ]) {
    const r = await c(path);
    check(`Página ${path}`, r.status === 200, String(r.status));
  }

  // Volver al estado del seed: Leo vuelve a tener la solicitud pendiente
  await demo(`/api/friends/${leoId}`, { method: 'POST', body: { action: 'remove' } });
  await leo('/api/friends', { method: 'POST', body: { username: 'demo' } });
  await sofi('/api/push', { method: 'DELETE', body: { endpoint: sub.endpoint } });
  sql('DELETE FROM "Report" WHERE details = \'smoke\'');
  await sofi('/api/notifications', { method: 'POST', body: {} });
} catch (err) {
  console.error('💥', err);
  failures++;
} finally {
  for (const s of sockets) s.disconnect();
}

console.log(failures ? `\n❌ ${failures} comprobaciones fallaron` : '\n✅ Fase 7 OK');
process.exit(failures ? 1 : 0);
