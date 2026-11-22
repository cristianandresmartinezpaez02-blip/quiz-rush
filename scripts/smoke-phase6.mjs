// Prueba de humo de la Fase 6 contra los servidores en marcha (AI_MOCK=1 npm run dev):
// generador con IA (modo simulado), ayudas del editor, plantillas, importar/exportar Excel y CSV,
// clases, tareas, informes y certificados. Sesiones reales (cuentas del seed).
// Uso: node scripts/smoke-phase6.mjs
const WEB = 'http://localhost:3000';
let failures = 0;

function check(name, cond, extra = '') {
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
}

/** Cliente con cookies propias; `form` envía multipart, `raw` devuelve los bytes. */
function web() {
  const jar = new Map();
  return async (path, { method = 'GET', body, form, raw = false } = {}) => {
    const res = await fetch(WEB + path, {
      method,
      redirect: 'manual',
      headers: {
        origin: WEB,
        ...(body !== undefined && { 'content-type': 'application/json' }),
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
      },
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    if (raw)
      return {
        status: res.status,
        headers: res.headers,
        bytes: new Uint8Array(await res.arrayBuffer()),
      };
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

async function play(c, start) {
  const s = await c('/api/solo', { method: 'POST', body: start });
  if (s.status !== 201) return { error: s.json?.error ?? s.status };
  let v = s.json.view;
  const id = s.json.id;
  let summary = null;
  for (let n = 0; n < 60 && !summary; n++) {
    const r = await c(`/api/solo/${id}/answer`, {
      method: 'POST',
      body: { qIndex: v.qIndex, answer: guess(v.question) },
    });
    if (r.status !== 200) throw new Error(`answer: ${r.status} ${r.text.slice(0, 160)}`);
    summary = r.json.summary;
    if (!summary) v = r.json.next ?? (await c(`/api/solo/${id}/next`, { method: 'POST' })).json;
  }
  if (!summary) summary = (await c(`/api/solo/${id}/finish`, { method: 'POST' })).json;
  return { summary };
}

const fileForm = (bytes, name, type, extra = {}) => {
  const f = new FormData();
  f.set('file', new Blob([bytes], { type }), name);
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  return f;
};
/** Todos mis quizzes (recorre la paginación por cursor). */
async function allMyQuizzes(c) {
  const items = [];
  let cursor = null;
  do {
    const page = (await c(`/api/quizzes${cursor ? `?cursor=${cursor}` : ''}`)).json;
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

try {
  const demo = await login('demo@quizrush.dev');
  const sofi = await login('sofi@quizrush.dev');
  const guest = web();

  // ── IA (modo simulado) ──
  const status = (await demo('/api/ai')).json;
  check('IA en modo simulado', status?.status === 'mock', JSON.stringify(status));
  const genForm = new FormData();
  genForm.set(
    'options',
    JSON.stringify({
      source: 'topic',
      input: 'El sistema solar',
      count: 5,
      types: ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'ORDER', 'SLIDER', 'FILL_BLANK'],
      language: 'es',
    }),
  );
  const gen = await demo('/api/ai/generate', { method: 'POST', form: genForm });
  check(
    'Generar quiz por tema',
    gen.status === 201 && gen.json.questions === 5,
    `${gen.status} ${gen.text.slice(0, 100)}`,
  );
  const aiQuizId = gen.json?.id;
  const aiQuiz = (await demo(`/api/quizzes/${aiQuizId}`)).json;
  check(
    'El quiz generado queda como borrador editable',
    aiQuiz?.status === 'DRAFT' && aiQuiz.doc?.questions?.length === 5,
    aiQuiz?.status,
  );

  const textForm = new FormData();
  textForm.set('options', JSON.stringify({ source: 'text', input: 'corto', count: 3 }));
  const short = await demo('/api/ai/generate', { method: 'POST', form: textForm });
  check(
    'Texto demasiado corto → AI_TEXT_TOO_SHORT',
    short.json?.error === 'AI_TEXT_TOO_SHORT',
    short.text.slice(0, 80),
  );

  const urlForm = new FormData();
  urlForm.set(
    'options',
    JSON.stringify({ source: 'url', input: 'http://127.0.0.1:5432/', count: 3 }),
  );
  const ssrf = await demo('/api/ai/generate', { method: 'POST', form: urlForm });
  check(
    'Enlace a la red interna bloqueado (SSRF)',
    ssrf.json?.error === 'URL_BLOCKED',
    ssrf.text.slice(0, 80),
  );

  const guestGen = await guest('/api/ai/generate', { method: 'POST', form: genForm });
  check(
    'Sin cuenta no se puede generar',
    guestGen.status === 401 || guestGen.status === 403,
    String(guestGen.status),
  );

  const dis = await demo('/api/ai/assist', {
    method: 'POST',
    body: {
      action: 'distractors',
      language: 'es',
      prompt: '¿Capital de Francia?',
      correct: ['París'],
      wrong: ['Roma'],
      count: 2,
    },
  });
  check(
    'Sugerir distractores',
    dis.status === 200 && dis.json.distractors?.length === 2,
    dis.text.slice(0, 100),
  );
  const exp = await demo('/api/ai/assist', {
    method: 'POST',
    body: {
      action: 'explanation',
      language: 'es',
      prompt: '¿Capital de Francia?',
      correct: ['París'],
      wrong: [],
    },
  });
  check(
    'Escribir explicación',
    exp.status === 200 && typeof exp.json.explanation === 'string',
    exp.text.slice(0, 100),
  );

  // ── Plantillas ──
  const tpl = await demo('/api/quizzes', {
    method: 'POST',
    body: { template: 'icebreaker', language: 'es' },
  });
  check(
    'Crear quiz desde plantilla',
    tpl.status === 201 && !!tpl.json?.id,
    `${tpl.status} ${tpl.text.slice(0, 80)}`,
  );

  // ── Exportar e importar ──
  const xlsx = await demo(`/api/quizzes/${aiQuizId}/export?format=xlsx`, { raw: true });
  check(
    'Exportar a Excel',
    xlsx.status === 200 && xlsx.bytes[0] === 0x50 && xlsx.bytes[1] === 0x4b,
    `${xlsx.status} ${xlsx.headers.get('content-type')}`,
  );
  const impX = await demo('/api/quizzes/import', {
    method: 'POST',
    form: fileForm(xlsx.bytes, 'quiz.xlsx', XLSX),
  });
  check(
    'Importar el Excel exportado (ida y vuelta)',
    impX.status === 201 && impX.json.imported === 5,
    impX.text.slice(0, 120),
  );

  const csv = await demo(`/api/quizzes/${aiQuizId}/export?format=csv`);
  const csvRaw = await demo(`/api/quizzes/${aiQuizId}/export?format=csv`, { raw: true });
  check(
    'Exportar a CSV (con BOM para Excel)',
    csv.status === 200 && csvRaw.bytes[0] === 0xef && csvRaw.bytes[1] === 0xbb,
    String(csv.status),
  );
  const impC = await demo('/api/quizzes/import', {
    method: 'POST',
    form: fileForm(csv.text, 'quiz.csv', 'text/csv'),
  });
  check(
    'Importar el CSV exportado',
    impC.status === 201 && impC.json.imported === 5,
    impC.text.slice(0, 120),
  );

  const bad =
    'tipo,pregunta,opcion1,opcion2,correcta\nopcion_multiple,"=HYPERLINK(""x"")",A,B,1\nnada,¿?,A,B,1\n';
  const impBad = await demo('/api/quizzes/import', {
    method: 'POST',
    form: fileForm(bad, 'malo.csv', 'text/csv'),
  });
  check(
    'CSV con filas malas: informa los errores por fila',
    impBad.status === 201 ? impBad.json.errors?.length >= 1 : impBad.json?.error === 'IMPORT_EMPTY',
    impBad.text.slice(0, 160),
  );

  const fake = await demo('/api/quizzes/import', {
    method: 'POST',
    form: fileForm('hola', 'falso.xlsx', XLSX),
  });
  check('Excel falso rechazado', fake.status === 400, fake.text.slice(0, 80));

  const tplX = await demo('/api/quizzes/import/template?format=xlsx', { raw: true });
  check(
    'Descargar plantilla de importación',
    tplX.status === 200 && tplX.bytes[0] === 0x50,
    String(tplX.status),
  );

  const forbidden = await sofi(`/api/quizzes/${aiQuizId}/export?format=csv`);
  check(
    'No se exporta el borrador de otra persona',
    forbidden.status === 404 || forbidden.status === 403,
    String(forbidden.status),
  );

  // ── Clases y tareas ──
  const cls = await demo('/api/classes', {
    method: 'POST',
    body: { name: 'Ciencias 3.º B (smoke)' },
  });
  check(
    'Crear clase',
    cls.status === 201 && /^[A-Z0-9]{6}$/.test(cls.json?.joinCode ?? ''),
    cls.text.slice(0, 80),
  );
  const classId = cls.json.id;
  const joinBad = await sofi('/api/classes/join', { method: 'POST', body: { code: 'ZZZZZZ' } });
  check(
    'Código inexistente rechazado',
    joinBad.status === 404 || joinBad.status === 400,
    joinBad.text.slice(0, 60),
  );
  const join = await sofi('/api/classes/join', {
    method: 'POST',
    body: { code: cls.json.joinCode },
  });
  check(
    'Estudiante se une con el código',
    join.status === 200 && join.json.id === classId,
    join.text.slice(0, 60),
  );
  const outsider = await guest(`/api/classes/${classId}`);
  check('Quien no es miembro no ve la clase', outsider.status !== 200, String(outsider.status));

  const published = (await allMyQuizzes(demo)).find(
    (q) => q.status === 'PUBLISHED' && q.questionCount >= 3,
  );
  const past = await demo(`/api/classes/${classId}/assignments`, {
    method: 'POST',
    body: {
      quizId: published.id,
      title: 'Ayer',
      dueAt: new Date(Date.now() - 86_400_000).toISOString(),
      settings: {},
    },
  });
  check(
    'Fecha límite pasada rechazada',
    past.json?.error === 'DUE_IN_PAST',
    past.text.slice(0, 60),
  );
  const notTeacher = await sofi(`/api/classes/${classId}/assignments`, {
    method: 'POST',
    body: {
      quizId: published.id,
      title: 'Tarea x',
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      settings: {},
    },
  });
  check('Un estudiante no crea tareas', notTeacher.status === 403, notTeacher.text.slice(0, 120));
  const asg = await demo(`/api/classes/${classId}/assignments`, {
    method: 'POST',
    body: {
      quizId: published.id,
      title: 'Tarea smoke',
      dueAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      settings: { maxAttempts: 1, passingScore: 0, certificate: true },
    },
  });
  check('Crear tarea', asg.status === 201 && !!asg.json?.id, asg.text.slice(0, 80));
  const assignmentId = asg.json.id;

  const notif = (await sofi('/api/notifications')).json;
  check(
    'El estudiante recibe la notificación de la tarea',
    JSON.stringify(notif ?? {}).includes('ASSIGNMENT'),
  );

  const run = await play(sofi, { mode: 'ASSIGNMENT', assignmentId });
  check(
    'El estudiante juega la tarea',
    !!run.summary?.assignment,
    JSON.stringify(run.error ?? run.summary?.assignment ?? {}),
  );
  const a = run.summary?.assignment;
  check(
    'Aprueba y recibe certificado',
    a?.passed === true && !!a?.certificateId,
    JSON.stringify(a),
  );
  const again = await sofi('/api/solo', {
    method: 'POST',
    body: { mode: 'ASSIGNMENT', assignmentId },
  });
  check(
    'Sin más intentos → NO_ATTEMPTS_LEFT',
    again.json?.error === 'NO_ATTEMPTS_LEFT',
    again.text.slice(0, 60),
  );

  if (a?.certificateId) {
    const cert = await guest(`/certificado/${a.certificateId}`);
    check(
      'El certificado es público y verificable',
      cert.status === 200 && /QR-[A-Z0-9]{4}-[A-Z0-9]{3}/.test(cert.text),
      String(cert.status),
    );
  }
  const fakeCert = await guest('/certificado/no-existe');
  check('Certificado inexistente → 404', fakeCert.status === 404, String(fakeCert.status));

  const rep = await demo(`/api/assignments/${assignmentId}/report`);
  check(
    'Informe de la tarea',
    rep.status === 200 && rep.json.summary.completed === 1 && rep.json.students[0].passed === true,
    JSON.stringify(rep.json?.summary ?? rep.text.slice(0, 80)),
  );
  check(
    'Estadísticas por pregunta',
    rep.json?.questions?.length >= 3 && rep.json.questions.every((q) => q.answered <= 1),
    String(rep.json?.questions?.length),
  );
  const repStudent = await sofi(`/api/assignments/${assignmentId}/report`);
  check(
    'El estudiante no ve el informe',
    repStudent.status === 403 || repStudent.status === 404,
    String(repStudent.status),
  );
  const repX = await demo(`/api/assignments/${assignmentId}/report?format=xlsx`, { raw: true });
  check('Informe en Excel', repX.status === 200 && repX.bytes[0] === 0x50, String(repX.status));
  const repC = await demo(`/api/assignments/${assignmentId}/report?format=csv`);
  check('Informe en CSV', repC.status === 200 && repC.text.includes('sofi'), String(repC.status));

  const studentView = (await sofi(`/api/classes/${classId}`)).json;
  check(
    'El estudiante ve su mejor nota',
    studentView?.assignments?.[0]?.mine?.attempts === 1,
    JSON.stringify(studentView?.assignments?.[0]?.mine),
  );

  // ── Informes de partidas en vivo ──
  const reportsPage = await demo('/informes');
  check('Página de informes', reportsPage.status === 200, String(reportsPage.status));
  const gameId = reportsPage.text.match(/\/informes\/partida\/([a-z0-9]+)/)?.[1];
  if (gameId) {
    const g = await demo(`/api/reports/games/${gameId}`);
    check(
      'Informe de una partida en vivo',
      g.status === 200 && Array.isArray(g.json.players),
      String(g.status),
    );
    const gOther = await sofi(`/api/reports/games/${gameId}`);
    check(
      'Otra persona no ve el informe de la partida',
      gOther.status === 404,
      String(gOther.status),
    );
  } else {
    console.log('ℹ️  demo no tiene partidas en vivo terminadas: se omite el informe de partida');
  }

  // ── Limpieza y páginas ──
  // Borrar los quizzes que creó esta prueba (generado, plantilla e importados)
  for (const qid of [aiQuizId, tpl.json?.id, impX.json?.id, impC.json?.id, impBad.json?.id]) {
    if (qid) await demo(`/api/quizzes/${qid}`, { method: 'DELETE' });
  }
  const del = await demo(`/api/assignments/${assignmentId}`, { method: 'DELETE' });
  check('Borrar tarea', del.status === 200 || del.status === 204, String(del.status));
  for (const path of ['/clases', `/clases/${classId}`, '/crear/ia', '/informes', '/mis-quizzes']) {
    const r = await demo(path);
    check(`Página ${path}`, r.status === 200, String(r.status));
  }
} catch (err) {
  console.error('💥', err);
  failures++;
}

console.log(failures ? `\n❌ ${failures} comprobaciones fallaron` : '\n✅ Fase 6 OK');
process.exit(failures ? 1 : 0);
