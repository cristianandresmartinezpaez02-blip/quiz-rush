// Guardado en PostgreSQL. Las respuestas se acumulan en Redis durante la pregunta y se
// guardan EN LOTE al cerrarla (nunca una a una); los resultados finales, al terminar.
// Los errores aquí no detienen la partida: se registran y el juego continúa.
import type { Redis } from 'ioredis';
import { db, type Prisma } from '@quiz-rush/db';
import { addReviewItems, recordPlay } from '@quiz-rush/db/progress';
import { isScored, TEAMS, type GameQuestion, type LiveMode } from '@quiz-rush/shared';
import type { GameStore } from './store';

/** Guarda jugadores nuevos y las respuestas de una pregunta. */
export async function persistQuestion(
  store: GameStore,
  gameId: string,
  qIndex: number,
  question: GameQuestion,
) {
  const [players, answers] = await Promise.all([
    store.allPlayers(gameId),
    store.answers(gameId, qIndex),
  ]);
  // Los jugadores se crean en la BD la primera vez que se guarda algo (no en cada entrada)
  await db.player.createMany({
    data: Object.entries(players).map(([id, p]) => ({
      id,
      gameId,
      nickname: p.n,
      avatar: { emoji: p.a },
      userId: p.u ?? null,
      kicked: !!p.k,
    })),
    skipDuplicates: true,
  });
  const rows = Object.entries(answers).map(([playerId, a]) => ({
    gameId,
    playerId,
    questionId: question.id,
    answer: (a.a ?? null) as Prisma.InputJsonValue,
    isCorrect: a.c >= 1,
    correctness: a.c,
    points: a.p,
    elapsedMs: a.t,
  }));
  // Lotes de 1.000 filas para no superar los límites de parámetros de PostgreSQL
  for (let i = 0; i < rows.length; i += 1000) {
    await db.playerAnswer.createMany({ data: rows.slice(i, i + 1000), skipDuplicates: true });
  }

  // Repaso inteligente: lo que falló cada jugador con cuenta entra en su lista de repaso
  if (isScored(question)) {
    await addReviewItems(
      Object.entries(answers)
        .filter(([pid, a]) => a.c < 1 && players[pid]?.u)
        .map(([pid]) => ({ userId: players[pid]!.u!, questionId: question.id })),
    );
  }
}

/** Resultados finales: puntajes, puestos, estadísticas de perfil y contadores del quiz. */
export async function persistFinal(
  store: GameStore,
  redis: Redis,
  gameId: string,
  quizId: string,
  mode: LiveMode,
  teamCount: number,
) {
  const [scores, states, players, teamOf] = await Promise.all([
    store.allScores(gameId),
    store.allPlayerStates(gameId),
    store.allPlayers(gameId),
    store.teamOf(gameId),
  ]);

  // Equipos (modos Equipos y Conquista): filas Team con su puntaje (media de sus miembros)
  if (Object.keys(teamOf).length) {
    const scoreOf = Object.fromEntries(scores.map((s) => [s.pid, s.score]));
    for (let t = 0; t < teamCount; t++) {
      const members = Object.entries(teamOf)
        .filter(([, idx]) => idx === t)
        .map(([pid]) => pid);
      const avg = members.length
        ? Math.round(members.reduce((a, pid) => a + (scoreOf[pid] ?? 0), 0) / members.length)
        : 0;
      const team = await db.team.create({
        data: {
          gameId,
          name: TEAMS[t]!.id,
          color: TEAMS[t]!.color,
          mascot: TEAMS[t]!.mascot,
          score: avg,
        },
        select: { id: true },
      });
      if (members.length) {
        await db.player.updateMany({ where: { id: { in: members } }, data: { teamId: team.id } });
      }
    }
  }

  const ids = scores.map((s) => s.pid);
  if (ids.length) {
    const col = <T>(fn: (pid: string, i: number) => T) => ids.map(fn);
    // Una sola sentencia para todos los jugadores (UPDATE … FROM unnest), sin importar cuántos sean
    await db.$executeRaw`
      UPDATE "Player" p SET
        "score" = v.score, "finalRank" = v.rank, "correctCount" = v.correct,
        "answeredCount" = v.answered, "bestStreak" = v.best
      FROM unnest(
        ${ids}::text[],
        ${col((_, i) => scores[i]!.score)}::int[],
        ${col((_, i) => scores[i]!.rank)}::int[],
        ${col((pid) => states[pid]?.c ?? 0)}::int[],
        ${col((pid) => states[pid]?.a ?? 0)}::int[],
        ${col((pid) => states[pid]?.b ?? 0)}::int[]
      ) AS v(id, score, rank, correct, answered, best)
      WHERE p."id" = v.id`;

    // Estadísticas del perfil de quienes jugaron con cuenta
    const withUser = ids.filter((pid) => players[pid]?.u);
    if (withUser.length) {
      await db.$executeRaw`
        UPDATE "Profile" pr SET
          "gamesPlayed" = pr."gamesPlayed" + 1,
          "totalCorrect" = pr."totalCorrect" + v.correct,
          "totalAnswered" = pr."totalAnswered" + v.answered
        FROM unnest(
          ${withUser.map((pid) => players[pid]!.u!)}::text[],
          ${withUser.map((pid) => states[pid]?.c ?? 0)}::int[],
          ${withUser.map((pid) => states[pid]?.a ?? 0)}::int[]
        ) AS v(user_id, correct, answered)
        WHERE pr."userId" = v.user_id`;
    }
  }

  await db.$transaction([
    db.gameSession.update({
      where: { id: gameId },
      data: { status: 'FINISHED', endedAt: new Date(), playerCount: ids.length, mode },
    }),
    // "Veces jugado" = personas que lo jugaron
    db.quiz.update({ where: { id: quizId }, data: { playCount: { increment: ids.length } } }),
  ]);

  // XP, monedas, misiones y logros de quienes jugaron con cuenta (en paralelo, de 5 en 5).
  // recordPlay es idempotente: si este paso se repite, nadie cobra dos veces.
  const scoredQuestions = (await store.quiz(gameId)).filter(isScored).length;
  const awards = ids
    .map((pid, i) => ({ pid, rank: scores[i]!.rank }))
    .filter(({ pid }) => players[pid]?.u && !players[pid]?.k);
  for (let i = 0; i < awards.length; i += 5) {
    await Promise.all(
      awards.slice(i, i + 5).map(({ pid, rank }) =>
        recordPlay({
          userId: players[pid]!.u!,
          refId: gameId,
          mode: 'LIVE',
          correct: states[pid]?.c ?? 0,
          answered: states[pid]?.a ?? 0,
          scoredQuestions,
          bestStreak: states[pid]?.b ?? 0,
          rank,
          players: ids.length,
          countsUpdated: true,
        }).catch((err: unknown) =>
          console.error('[progreso] no se pudo registrar la partida:', err),
        ),
      ),
    );
  }

  // La página pública del quiz y su ranking deben mostrar la nueva partida
  // (claves de la caché de la app web: apps/web/lib/cache.ts usa el prefijo "cache:")
  await redis
    .del(`cache:quiz:leaderboard:${quizId}`, `cache:quiz:public:${quizId}`)
    .catch(() => {});
}

export async function markStarted(gameId: string, mode: LiveMode) {
  await db.gameSession.update({
    where: { id: gameId },
    data: { status: 'IN_PROGRESS', startedAt: new Date(), mode },
  });
}

export async function markCancelled(gameId: string) {
  await db.gameSession.update({
    where: { id: gameId },
    data: { status: 'CANCELLED', endedAt: new Date() },
  });
}
