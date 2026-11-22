// Prueba de humo de la Fase 5 contra los servidores en marcha (npm run dev):
// progreso, modos individuales (práctica, rush, reto diario, desafío, aventura, repaso),
// tienda, avatar, misiones y pase de temporada. Sesiones reales (cuentas del seed).
// Uso: node scripts/smoke-phase5.mjs
const WEB = 'http://localhost:3000';
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

/** Respuesta "plausible" según el tipo (no siempre correcta: se comprueba la coherencia). */
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

/** Juega una partida individual completa; devuelve el resumen y las respuestas. */
async function play(c, start, { maxAnswers = 60 } = {}) {
  const s = await c('/api/solo', { method: 'POST', body: start });
  if (s.status !== 201) throw new Error(`start ${start.mode}: ${s.status} ${s.text.slice(0, 120)}`);
  let v = s.json.view;
  const id = s.json.id;
  const results = [];
  let summary = null;
  for (let n = 0; n < maxAnswers && !summary; n++) {
    const q = v.question;
    const answer = guess(q);
    const r = await c(`/api/solo/${id}/answer`, {
      method: 'POST',
      body: { qIndex: v.qIndex, answer },
    });
    if (r.status !== 200) throw new Error(`answer: ${r.status} ${r.text.slice(0, 160)}`);
    results.push({ q, answer, res: r.json });
    summary = r.json.summary;
    if (summary) break;
    v = r.json.next ?? (await c(`/api/solo/${id}/next`, { method: 'POST' })).json;
  }
  if (!summary) summary = (await c(`/api/solo/${id}/finish`, { method: 'POST' })).json;
  return { id, summary, results };
}

try {
  const demo = await login('demo@quizrush.dev');
  const sofi = await login('sofi@quizrush.dev');

  // ── Panel de progreso ──
  const before = (await demo('/api/progress')).json;
  check(
    'Panel de progreso',
    !!before?.profile && before.missions.length === 6,
    `nivel ${before?.profile?.level}`,
  );
  check(
    'Más de 30 logros (los secretos ocultos)',
    before.achievements.length >= 30 && before.achievements.some((a) => a.secret),
  );
  check('Pase de temporada activo con 30 niveles', before.season?.tiers === 30);

  // ── Práctica: el servidor corrige y devuelve la solución ──
  const lib = (await demo('/api/library?q=matematicas')).json;
  const quizId = lib.items[0].id;
  const practice = await play(demo, { mode: 'PRACTICE', quizId });
  const coherent = practice.results.every(({ answer, res }) =>
    answer.optionIds && res.solution.kind === 'options'
      ? res.correct ===
        (res.solution.optionIds.length === 1 && res.solution.optionIds[0] === answer.optionIds[0])
      : true,
  );
  check(
    'Práctica: corrección coherente con la solución',
    coherent,
    `${practice.summary.correct}/${practice.summary.total}`,
  );
  check(
    'Práctica: recompensa y progreso al terminar',
    practice.summary.progress && practice.summary.rewards.xp === practice.summary.progress.xp,
    `+${practice.summary.progress?.xp} XP`,
  );
  check(
    'La respuesta correcta nunca llega antes de responder',
    !JSON.stringify(practice.results[0].q).includes('isCorrect'),
  );

  // Terminar dos veces no paga dos veces
  const again = await demo(`/api/solo/${practice.id}/finish`, { method: 'POST' });
  check(
    'Terminar otra vez devuelve el mismo resumen',
    again.json.rewards.xp === practice.summary.rewards.xp,
  );
  const wrongQ = await demo(`/api/solo/${practice.id}/answer`, {
    method: 'POST',
    body: { qIndex: 0, answer: { optionIds: ['x'] } },
  });
  check('No se puede responder una partida terminada', wrongQ.status === 409);

  // ── Rush: 1 punto por acierto, los fallos restan tiempo ──
  const rush = await play(demo, { mode: 'RUSH' }, { maxAnswers: 25 });
  const wrong = rush.results.filter((r) => !r.res.correct);
  const penalized = wrong.length < 2 || wrong[1].res.endsAt < wrong[0].res.endsAt;
  check(
    'Rush: los fallos restan 3 s',
    penalized,
    `${rush.summary.score} aciertos, ${wrong.length} fallos`,
  );
  check('Rush: puesto en el ranking del día', rush.summary.position >= 1);
  const rushBoard = (await demo('/api/rush')).json;
  check(
    'Ranking del Rush',
    rushBoard.leaderboard.some((r) => r.username === 'demo') &&
      rushBoard.best >= rush.summary.score,
  );

  // ── Reto diario: un intento por día ──
  const daily = (await sofi('/api/daily')).json;
  check('Reto diario: quiz del día', !!daily.quiz?.id, daily.quiz?.title);
  if (!daily.played) {
    const d = await play(sofi, { mode: 'DAILY' });
    check('Reto diario jugado', d.summary.position >= 1);
  }
  const repeat = await sofi('/api/solo', { method: 'POST', body: { mode: 'DAILY' } });
  check(
    'Reto diario: solo un intento',
    repeat.status === 409 && repeat.json.error === 'ALREADY_PLAYED',
  );
  check(
    'Ranking del reto diario',
    (await sofi('/api/daily')).json.leaderboard.some((r) => r.username === 'sofi'),
  );

  // ── Desafío por enlace ──
  const ch = await demo('/api/challenges', { method: 'POST', body: { quizId, days: 2 } });
  check('Crear desafío', ch.status === 201 && !!ch.json.id);
  await play(sofi, { mode: 'CHALLENGE', challengeId: ch.json.id });
  const chInfo = (await sofi(`/api/challenges/${ch.json.id}`)).json;
  check('Desafío: ranking con el intento', chInfo.leaderboard.length === 1 && !!chInfo.played);
  const chAgain = await sofi('/api/solo', {
    method: 'POST',
    body: { mode: 'CHALLENGE', challengeId: ch.json.id },
  });
  check('Desafío: un intento por persona', chAgain.status === 409);
  check('Página del desafío', (await web()(`/desafio/${ch.json.id}`)).status === 200);

  // ── Aventura ──
  const adv = (await demo('/api/adventure')).json;
  check(
    'Aventura: 4 mundos, el primer nivel abierto',
    adv.worlds.length === 4 && adv.worlds[0].levels[0].unlocked,
  );
  const locked = await demo('/api/solo', {
    method: 'POST',
    body: { mode: 'ADVENTURE', level: 'future-6' },
  });
  check('Aventura: niveles bloqueados', locked.status === 403);
  const lvl = await play(demo, { mode: 'ADVENTURE', level: 'nature-1' });
  check(
    'Aventura: estrellas por aciertos',
    lvl.summary.stars >= 0 && lvl.summary.total === 5,
    `${lvl.summary.stars}★`,
  );

  // ── Repaso: las falladas vuelven ──
  const prog = (await demo('/api/progress')).json;
  check(
    'Repaso: hay preguntas falladas pendientes',
    prog.reviewDue > 0,
    `${prog.reviewDue} pendientes`,
  );
  const review = await play(demo, { mode: 'REVIEW' });
  check('Repaso jugado', review.summary.answered > 0);

  // ── Tienda y avatar ──
  const shop = (await demo('/api/shop')).json;
  check(
    'Tienda con artículos y monedas',
    shop.items.length > 30 && shop.coins >= 0,
    `${shop.coins} monedas`,
  );
  const cheap = shop.items.find((i) => !i.owned && !i.seasonOnly && i.price <= shop.coins);
  if (cheap) {
    const buy = await demo('/api/shop/buy', { method: 'POST', body: { code: cheap.code } });
    check(
      'Comprar un artículo',
      buy.status === 200 && buy.json.coins === shop.coins - cheap.price,
      cheap.code,
    );
    if (cheap.slot) {
      const save = await demo('/api/avatar', {
        method: 'PUT',
        body: { config: { ...shop.avatar, [cheap.slot]: cheap.part } },
      });
      check(
        'Usar lo comprado en el avatar',
        save.status === 200 && save.json.config[cheap.slot] === cheap.part,
      );
    }
  }
  const lockedAvatar = await demo('/api/avatar', {
    method: 'PUT',
    body: { config: { hat: 'laurel' } },
  });
  check('No se pueden usar piezas no compradas', lockedAvatar.status === 403);
  const noMoney = await sofi('/api/shop/buy', { method: 'POST', body: { code: 'body:dragon' } });
  check('Sin monedas suficientes no se compra', noMoney.status === 402 || noMoney.status === 409);

  // ── Misiones y temporada ──
  const after = (await demo('/api/progress')).json;
  check(
    'La XP sube tras jugar',
    after.profile.xp > before.profile.xp,
    `${before.profile.xp} → ${after.profile.xp}`,
  );
  check('Racha diaria activa', after.profile.dailyStreak >= 1 && after.profile.playedToday);
  check('Liga de la semana', !!after.league && after.league.members.some((m) => m.me));
  const done = after.missions.find((m) => m.completed && !m.claimed && m.id);
  if (done) {
    const claim = await demo(`/api/progress/missions/${done.id}/claim`, { method: 'POST' });
    check('Cobrar una misión completada', claim.status === 200, done.code);
    const twice = await demo(`/api/progress/missions/${done.id}/claim`, { method: 'POST' });
    check('Una misión no se cobra dos veces', twice.status === 409);
  }
  if (after.season.tier >= 1 && !after.season.claimed.includes(1)) {
    const tier = await demo('/api/progress/season/1/claim', { method: 'POST' });
    check('Cobrar el nivel 1 del pase de temporada', tier.status === 200);
  }
  const lockedTier = await demo('/api/progress/season/30/claim', { method: 'POST' });
  check('Niveles del pase no alcanzados', lockedTier.status === 403 || lockedTier.status === 409);

  // ── Páginas ──
  for (const path of ['/progreso', '/tienda', '/solo', '/aventura', '/reto-diario', '/duelo']) {
    check(`Página ${path}`, (await demo(path)).status === 200);
  }
  check('Sin sesión, el progreso pide entrar', (await web()('/progreso')).status === 307);
} catch (err) {
  check('Sin errores inesperados', false, err.message);
}

console.log(
  failures ? `\n❌ ${failures} comprobaciones fallaron` : '\n✅ Todas las comprobaciones pasaron',
);
process.exit(failures ? 1 : 0);
