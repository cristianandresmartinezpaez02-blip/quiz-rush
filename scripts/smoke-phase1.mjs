// Prueba de humo de la Fase 1 contra el servidor en marcha (npm run dev).
// Nota: Better Auth limita a 5 registros/min por IP; espera 1 minuto entre ejecuciones.
// Uso: node scripts/smoke-phase1.mjs [http://localhost:3000]
// Recorre: salud, páginas, registro, crear quiz, autoguardado, publicación automática,
// conflicto de revisión, versiones/restaurar, perfil, invitado y seguridad básica.
const BASE = process.argv[2] ?? 'http://localhost:3000';
let failures = 0;

function check(name, cond, extra = '') {
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
}

/** Cliente HTTP mínimo con cookies (simula un navegador). */
function client() {
  const jar = new Map();
  return async function req(path, { method = 'GET', body, headers = {} } = {}) {
    const res = await fetch(BASE + path, {
      method,
      redirect: 'manual',
      headers: {
        origin: BASE,
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

const anon = client();
const health = await anon('/health');
check(
  'GET /health',
  health.status === 200 && health.json?.database === 'up',
  JSON.stringify(health.json),
);

for (const page of ['/', '/entrar', '/registro', '/biblioteca']) {
  const r = await anon(page);
  check(`Página ${page}`, r.status === 200);
}
check('Editor sin sesión redirige al login', (await anon('/mis-quizzes')).status === 307);
check('API sin sesión → 401', (await anon('/api/quizzes')).status === 401);

// ── Registro ──
const a = client();
const email = `smoke${Date.now()}@test.dev`;
const signUp = await a('/api/auth/sign-up/email', {
  method: 'POST',
  body: { name: 'Ana Prueba', email, password: 'Secreta123!' },
});
check('Registro con email', signUp.status === 200, `status ${signUp.status}`);

const me = await a('/api/auth/get-session');
check('Sesión activa tras registro', me.json?.user?.email === email);

// ── Crear quiz ──
const created = await a('/api/quizzes', { method: 'POST', body: { language: 'es' } });
check('Crear quiz', created.status === 201 && !!created.json?.id);
const id = created.json.id;
const editor = await a(`/api/quizzes/${id}`);
check('Estado inicial = borrador', editor.json?.status === 'DRAFT' && editor.json.revision === 0);
check('Borrador vacío tiene avisos', editor.json?.issues?.length > 0);

// ── Autoguardado incompleto: sigue en borrador ──
let doc = editor.json.doc;
doc.title = 'Sistema Solar';
let save = await a(`/api/quizzes/${id}`, { method: 'PUT', body: { baseRevision: 0, doc } });
check(
  'Autoguardado (incompleto)',
  save.status === 200 && save.json.revision === 1 && save.json.status === 'DRAFT',
);

// ── Completar → publicación automática ──
const q = doc.questions[0];
q.prompt = '¿Cuál es el planeta más grande?';
['Júpiter', 'Saturno', 'Tierra', 'Marte'].forEach((t, i) => (q.options[i].text = t));
save = await a(`/api/quizzes/${id}`, { method: 'PUT', body: { baseRevision: 1, doc } });
check(
  'Quiz completo se publica solo',
  save.status === 200 && save.json.status === 'PUBLISHED' && save.json.justPublished === true,
  `slug=${save.json?.slug}`,
);

// ── Editar un publicado dejándolo incompleto: la biblioteca no se rompe ──
doc.questions.push({
  ...structuredClone(q),
  id: crypto.randomUUID(),
  prompt: '',
  options: q.options.map((o) => ({ ...o, id: crypto.randomUUID() })),
});
save = await a(`/api/quizzes/${id}`, { method: 'PUT', body: { baseRevision: 2, doc } });
check(
  'Cambio inválido no despublica (cambios pendientes)',
  save.json?.status === 'PUBLISHED' && save.json.hasUnpublishedChanges === true,
);

// ── Conflicto de revisión (otra pestaña con revisión vieja) ──
const conflict = await a(`/api/quizzes/${id}`, { method: 'PUT', body: { baseRevision: 1, doc } });
check(
  'Revisión vieja → 409 con el documento del servidor',
  conflict.status === 409 && conflict.json?.details?.revision === 3,
);

// ── Corregir → vuelve a sincronizar la versión publicada ──
doc.questions[1].prompt = '¿Qué planeta tiene anillos?';
save = await a(`/api/quizzes/${id}`, { method: 'PUT', body: { baseRevision: 3, doc } });
check(
  'Corregido → publicado sin cambios pendientes',
  save.json?.status === 'PUBLISHED' && save.json.hasUnpublishedChanges === false,
);

// ── Versiones ──
await a(`/api/quizzes/${id}/versions`, { method: 'POST' });
const versions = await a(`/api/quizzes/${id}/versions`);
check(
  'Historial de versiones',
  versions.json?.items?.length >= 2,
  `${versions.json?.items?.length} versiones`,
);
const publishVersion = versions.json.items.find((v) => v.reason === 'PUBLISH');
const restored = await a(`/api/quizzes/${id}/versions/${publishVersion.id}`, { method: 'POST' });
check('Restaurar versión', restored.status === 200 && restored.json.doc.questions.length === 1);

// ── Páginas con sesión (renderizado en servidor sin errores) ──
// Marcadores propios de cada página (los textos de error viajan en los diccionarios, no sirven)
for (const [page, marker] of [
  ['/mis-quizzes', '>Mis quizzes</h1>'],
  [`/crear/${id}`, 'Sistema Solar'],
  ['/ajustes', '>Ajustes</h1>'],
]) {
  const r = await a(page, { headers: { 'accept-language': 'es' } });
  check(
    `Página con sesión ${page}`,
    r.status === 200 && r.text.includes(marker),
    `status ${r.status}`,
  );
}
check('Editor de quiz ajeno → 404', (await anon(`/crear/${id}`)).status === 307);

// ── Seguridad ──
const b = client();
await b('/api/auth/sign-up/email', {
  method: 'POST',
  body: { name: 'Otro', email: `otro${Date.now()}@test.dev`, password: 'Secreta123!' },
});
check('Otro usuario no puede leer el quiz', (await b(`/api/quizzes/${id}`)).status === 403);
check('Otro usuario no ve el editor (404)', (await b(`/crear/${id}`)).status === 404);
const bad = await a(`/api/quizzes/${id}`, {
  method: 'PUT',
  body: { baseRevision: 99, doc: { title: 5 } },
});
check('Cuerpo inválido → 400', bad.status === 400);
const offensive = structuredClone(restored.json.doc);
offensive.title = 'Quiz de mierda';
save = await a(`/api/quizzes/${id}`, {
  method: 'PUT',
  body: { baseRevision: restored.json.revision, doc: offensive },
});
check(
  'Título ofensivo no se publica',
  save.json?.issues?.some((i) => i.code === 'TITLE_OFFENSIVE'),
);

// ── Perfil ──
const username = `ana_${Date.now().toString().slice(-6)}`;
const prof = await a('/api/profile', {
  method: 'PATCH',
  body: { username, bio: 'Me encanta la astronomía' },
});
check('Actualizar perfil', prof.status === 200 && prof.json.username === username);
check('Perfil público visible', (await anon(`/perfil/${username}`)).status === 200);
const badName = await a('/api/profile', { method: 'PATCH', body: { username: 'el_puto_amo' } });
check('Nombre de usuario ofensivo rechazado', badName.status === 400);

// ── Invitado ──
const g = client();
const guest = await g('/api/auth/sign-in/anonymous', { method: 'POST', body: {} });
check('Entrar como invitado', guest.status === 200 && guest.json?.user?.isAnonymous === true);
const gQuiz = await g('/api/quizzes', { method: 'POST', body: { language: 'es' } });
check('Invitado puede crear quiz', gQuiz.status === 201);
const claim = await g('/api/auth/sign-up/email', {
  method: 'POST',
  body: { name: 'Ex Invitado', email: `claim${Date.now()}@test.dev`, password: 'Secreta123!' },
});
const claimed = await g('/api/quizzes');
check(
  'Al crear cuenta, el invitado conserva sus quizzes',
  claim.status === 200 && claimed.json?.items?.some((x) => x.id === gQuiz.json.id),
);

// ── Limpieza: los quizzes de prueba no deben quedarse en la Biblioteca ──
await a(`/api/quizzes/${id}`, { method: 'DELETE' });
if (gQuiz.json?.id) await g(`/api/quizzes/${gQuiz.json.id}`, { method: 'DELETE' });
const leftovers = await anon('/api/library?q=sistema');
check(
  'Limpieza de quizzes de prueba',
  leftovers.json?.items?.every((q) => q.id !== id),
);

console.log(
  failures ? `\n❌ ${failures} comprobaciones fallaron` : '\n✅ Todas las comprobaciones pasaron',
);
process.exit(failures ? 1 : 0);
