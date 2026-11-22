// Prueba de humo de la Fase 2 (Biblioteca y comunidad) contra el servidor en marcha.
// Requiere `npm run dev` y `npm run db:seed`. Uso: node scripts/smoke-phase2.mjs
// Trabaja sobre un quiz temporal que se borra al final (no altera los datos de demostración).
const BASE = process.argv[2] ?? 'http://localhost:3000';
const PASSWORD = 'QuizRush123!';
let failures = 0;

function check(name, cond, extra = '') {
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
}

function client() {
  const jar = new Map();
  const req = async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(BASE + path, {
      method,
      redirect: 'manual',
      headers: {
        origin: BASE,
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
    return { status: res.status, json, text };
  };
  req.signIn = (email) =>
    req('/api/auth/sign-in/email', { method: 'POST', body: { email, password: PASSWORD } });
  return req;
}

const anon = client();

// ── Biblioteca: búsqueda, filtros y paginación ──
const lib = await anon('/api/library?sort=trending');
check(
  'Listado de la biblioteca',
  lib.status === 200 && lib.json.items.length >= 10,
  `${lib.json?.items?.length} quizzes`,
);

const typo = await anon('/api/library?q=sistma%20solr');
check(
  'Búsqueda tolera errores ("sistma solr")',
  typo.json?.items?.[0]?.title === 'Viaje por el Sistema Solar',
);

const accents = await anon('/api/library?q=matematicas');
check(
  'Búsqueda ignora tildes ("matematicas")',
  accents.json?.items?.some((q) => q.title === 'Matemáticas mentales'),
);

const prefix = await anon('/api/library?q=capi');
check(
  'Búsqueda por prefijo ("capi")',
  prefix.json?.items?.some((q) => q.title.startsWith('Capitales')),
);

const tag = await anon('/api/library?q=rompehielos');
check(
  'Búsqueda por etiqueta',
  tag.json?.items?.some((q) => q.title === 'Rompehielos para equipos'),
);

const en = await anon('/api/library?language=en');
check(
  'Filtro por idioma',
  en.json?.items?.length === 2 && en.json.items.every((q) => q.language === 'en'),
);

const cat = await anon('/api/library?category=history');
check(
  'Filtro por categoría',
  cat.json?.items?.length >= 1 && cat.json.items.every((q) => q.category === 'history'),
);

const poll = await anon('/api/library?type=POLL');
check(
  'Filtro por tipo de pregunta',
  poll.json?.items?.every((q) => q.questionTypes.includes('POLL')) && poll.json.items.length >= 1,
);

const short = await anon('/api/library?duration=short');
check(
  'Filtro por duración',
  short.json?.items?.every((q) => q.durationSec < 180),
);

const hard = await anon('/api/library?difficulty=HARD&sort=new');
check(
  'Filtro por dificultad + orden',
  hard.json?.items?.every((q) => q.difficulty === 'HARD'),
);

// Paginación por cursor: 3 páginas de 4 sin duplicados ni huecos
const seen = [];
let cursor = '';
for (let page = 0; page < 3; page++) {
  const r = await anon(`/api/library?sort=popular&limit=4${cursor ? `&cursor=${cursor}` : ''}`);
  seen.push(...r.json.items.map((q) => q.playCount));
  cursor = r.json.nextCursor;
  if (!cursor) break;
}
const sorted = [...seen].sort((a, b) => b - a);
check(
  'Paginación por cursor ordenada y sin duplicados',
  seen.length >= 10 && JSON.stringify(seen) === JSON.stringify(sorted),
  `${seen.length} elementos`,
);

check('Filtro inválido → 400', (await anon('/api/library?category=hackeo')).status === 400);

// ── Páginas ──
for (const page of ['/biblioteca', '/biblioteca?q=cine', '/perfil/profe_luna']) {
  check(`Página ${page}`, (await anon(page)).status === 200);
}
const quizId = lib.json.items[0].id;
const quizPage = await anon(`/quiz/${quizId}`);
check('Página del quiz', quizPage.status === 200);
check('La página del quiz no filtra respuestas', !quizPage.text.includes('"isCorrect"'));
const og = quizPage.text.match(/property="og:image" content="([^"]+)"/)?.[1];
const ogRes = og ? await fetch(og) : null;
check('Imagen para redes (Open Graph)', ogRes?.headers.get('content-type') === 'image/png');
check('Quiz inexistente → 404', (await anon('/quiz/no-existe')).status === 404);

// ── Comunidad ──
const demo = client();
await demo.signIn('demo@quizrush.dev');
const sofi = client();
await sofi.signIn('sofi@quizrush.dev');
const leo = client();
await leo.signIn('leogamer@quizrush.dev');
const demoId = (await demo('/api/auth/get-session')).json.user.id;

// Leo sigue a la cuenta demo
await leo(`/api/users/${demoId}/follow`, { method: 'DELETE' });
const follow = await leo(`/api/users/${demoId}/follow`, { method: 'POST' });
check('Seguir a un creador', follow.status === 200 && follow.json.following === true);
check(
  'No se puede seguir a uno mismo',
  (await demo(`/api/users/${demoId}/follow`, { method: 'POST' })).status === 400,
);

// La cuenta demo publica un quiz temporal → los seguidores reciben aviso
const created = await demo('/api/quizzes', { method: 'POST', body: { language: 'es' } });
const tmpId = created.json.id;
const editor = await demo(`/api/quizzes/${tmpId}`);
const doc = editor.json.doc;
doc.title = 'Quiz temporal de prueba automática';
doc.tags = ['pruebaauto'];
doc.questions[0].prompt = '¿Cuánto es 2 + 2?';
['4', '3', '5', '22'].forEach((t, i) => (doc.questions[0].options[i].text = t));
const pub = await demo(`/api/quizzes/${tmpId}`, { method: 'PUT', body: { baseRevision: 0, doc } });
check('Publicar quiz temporal', pub.json?.justPublished === true);
await new Promise((r) => setTimeout(r, 1500)); // el aviso se envía después de responder
const notes = await leo('/api/notifications');
check(
  'Seguidor recibe aviso de publicación',
  notes.json?.items?.some((n) => n.type === 'NEW_QUIZ' && n.data.quizId === tmpId),
);
const found = await anon('/api/library?q=pruebaauto');
check('El quiz publicado aparece en la búsqueda al instante', found.json?.items?.[0]?.id === tmpId);

// Favoritos
const fav = await sofi(`/api/quizzes/${tmpId}/favorite`, { method: 'POST' });
await sofi(`/api/quizzes/${tmpId}/favorite`, { method: 'POST' }); // idempotente
let me = await sofi(`/api/quizzes/${tmpId}/me`);
const favCount = (await anon(`/api/library?q=pruebaauto`)).json.items[0].favoriteCount;
check(
  'Favorito (idempotente, contador = 1)',
  fav.status === 200 && me.json.favorited && favCount === 1,
  `contador ${favCount}`,
);

// Calificaciones
check(
  'No se puede calificar el propio quiz',
  (await demo(`/api/quizzes/${tmpId}/rating`, { method: 'PUT', body: { stars: 5 } })).status ===
    403,
);
await sofi(`/api/quizzes/${tmpId}/rating`, { method: 'PUT', body: { stars: 5 } });
const rerate = await sofi(`/api/quizzes/${tmpId}/rating`, { method: 'PUT', body: { stars: 3 } });
const rate2 = await leo(`/api/quizzes/${tmpId}/rating`, { method: 'PUT', body: { stars: 4 } });
check(
  'Calificar y cambiar la nota',
  rerate.json?.ratingCount === 1 && rate2.json?.ratingCount === 2 && rate2.json.ratingAvg === 3.5,
  `media ${rate2.json?.ratingAvg}`,
);
check(
  'Calificación fuera de rango → 400',
  (await sofi(`/api/quizzes/${tmpId}/rating`, { method: 'PUT', body: { stars: 9 } })).status ===
    400,
);

// Comentarios
const c1 = await sofi(`/api/quizzes/${tmpId}/comments`, {
  method: 'POST',
  body: { body: '¡Qué fácil! 😄' },
});
check('Comentar', c1.status === 201);
check(
  'Comentario ofensivo rechazado',
  (
    await sofi(`/api/quizzes/${tmpId}/comments`, {
      method: 'POST',
      body: { body: 'esto es una mierda' },
    })
  ).status === 400,
);
const r1 = await demo(`/api/quizzes/${tmpId}/comments`, {
  method: 'POST',
  body: { body: '¡Gracias!', parentId: c1.json.id },
});
const r2 = await leo(`/api/quizzes/${tmpId}/comments`, {
  method: 'POST',
  body: { body: 'Jaja sí', parentId: r1.json.id },
});
const replies = await anon(`/api/comments/${c1.json.id}/replies`);
check(
  'Respuestas (un nivel: responder a una respuesta cuelga del raíz)',
  replies.json?.items?.length === 2 && r2.json.parentId === c1.json.id,
);
const like = await leo(`/api/comments/${c1.json.id}/like`, { method: 'POST' });
check('Me gusta en comentario', like.json?.likeCount === 1);
const authorNotes = await demo('/api/notifications');
check(
  'El autor recibe aviso del comentario',
  authorNotes.json?.items?.some((n) => n.type === 'COMMENT' && n.data.quizId === tmpId),
);
check(
  'Leo no puede borrar el comentario de Sofi',
  (await leo(`/api/comments/${c1.json.id}`, { method: 'DELETE' })).status === 403,
);
const del = await demo(`/api/comments/${c1.json.id}`, { method: 'DELETE' });
const afterDel = await anon(`/api/quizzes/${tmpId}/comments`);
check(
  'El autor del quiz puede moderar comentarios',
  del.status === 200 && afterDel.json.items.length === 0,
);

// Colecciones
const col = await sofi('/api/collections', {
  method: 'POST',
  body: { name: 'Mis favoritos de mates' },
});
await sofi(`/api/collections/${col.json.id}/items`, { method: 'POST', body: { quizId: tmpId } });
const mine = await sofi('/api/collections');
check(
  'Crear colección y añadir quiz',
  mine.json?.items?.find((c) => c.id === col.json.id)?.itemCount === 1,
);
check(
  'Colección privada no visible para otros',
  (await leo(`/api/collections/${col.json.id}`)).status === 404,
);
await sofi(`/api/collections/${col.json.id}`, {
  method: 'PATCH',
  body: { name: 'Mates', isPublic: true },
});
check(
  'Colección pública visible para otros',
  (await leo(`/api/collections/${col.json.id}`)).json?.items?.length === 1,
);
check(
  'Nombre de colección ofensivo rechazado',
  (await sofi('/api/collections', { method: 'POST', body: { name: 'puta mierda' } })).status ===
    400,
);
await sofi(`/api/collections/${col.json.id}`, { method: 'DELETE' });

// Remix
const remix = await leo(`/api/quizzes/${tmpId}/remix`, { method: 'POST' });
const remixState = await leo(`/api/quizzes/${remix.json?.id}`);
check(
  'Remix con crédito al original',
  remix.status === 201 &&
    remixState.json?.remixOf?.id === tmpId &&
    remixState.json.status === 'DRAFT',
);
const remixNote = await demo('/api/notifications');
check(
  'El autor recibe aviso del remix',
  remixNote.json?.items?.some((n) => n.type === 'REMIX'),
);
await leo(`/api/quizzes/${remix.json.id}`, { method: 'DELETE' });

// Reportes
check(
  'Reportar quiz',
  (
    await leo('/api/reports', {
      method: 'POST',
      body: { targetType: 'QUIZ', targetId: tmpId, reason: 'SPAM' },
    })
  ).status === 201,
);
check(
  'Reporte duplicado → 409',
  (
    await leo('/api/reports', {
      method: 'POST',
      body: { targetType: 'QUIZ', targetId: tmpId, reason: 'SPAM' },
    })
  ).status === 409,
);

// Invitados: pueden guardar, pero no calificar ni comentar
const guest = client();
await guest('/api/auth/sign-in/anonymous', { method: 'POST', body: {} });
check(
  'Invitado puede guardar favoritos',
  (await guest(`/api/quizzes/${tmpId}/favorite`, { method: 'POST' })).status === 200,
);
const guestRate = await guest(`/api/quizzes/${tmpId}/rating`, {
  method: 'PUT',
  body: { stars: 5 },
});
check(
  'Invitado no puede calificar (requiere cuenta)',
  guestRate.status === 403 && guestRate.json.error === 'ACCOUNT_REQUIRED',
);

// Notificaciones: marcar como leídas
await leo('/api/notifications', { method: 'POST', body: {} });
check('Marcar notificaciones como leídas', (await leo('/api/notifications')).json.unread === 0);

// Limpieza
await leo(`/api/users/${demoId}/follow`, { method: 'DELETE' });
await demo(`/api/quizzes/${tmpId}`, { method: 'DELETE' });
check(
  'Quiz borrado desaparece de la biblioteca',
  (await anon('/api/library?q=pruebaauto')).json.items.length === 0,
);

console.log(
  failures ? `\n❌ ${failures} comprobaciones fallaron` : '\n✅ Todas las comprobaciones pasaron',
);
process.exit(failures ? 1 : 0);
