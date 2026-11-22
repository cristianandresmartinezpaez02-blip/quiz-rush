// Resultados para compartir en redes (/resultado/<playerId>): solo resultados finales y solo
// datos que ya eran visibles en el podio (apodo, puntos, aciertos, puesto, quiz). Nada de correos
// ni respuestas. El id del jugador no se puede adivinar (cuid).
import 'server-only';
import { db } from '@quiz-rush/db';
import { attemptPercent, isScored, type GameQuestion } from '@quiz-rush/shared';

export async function getShareResult(playerId: string) {
  const p = await db.player.findUnique({
    where: { id: playerId },
    select: {
      nickname: true,
      score: true,
      correctCount: true,
      answeredCount: true,
      bestStreak: true,
      finalRank: true,
      kicked: true,
      game: {
        select: {
          mode: true,
          status: true,
          soloKey: true,
          playerCount: true,
          endedAt: true,
          quizSnapshot: true,
          quiz: { select: { id: true, title: true, status: true, visibility: true } },
        },
      },
    },
  });
  // Disponible en cuanto hay puesto final (en el podio la partida aún no está cerrada)
  if (!p || p.kicked || (p.finalRank === null && p.game.status !== 'FINISHED')) return null;
  const questions = (
    (p.game.quizSnapshot as { questions?: GameQuestion[] } | null)?.questions ?? []
  ).filter(isScored);
  const total = p.game.mode === 'RUSH' ? p.answeredCount : questions.length || p.answeredCount;
  // Solo se enlaza el quiz si es público (las tareas de clase usan quizzes no listados)
  const quiz = p.game.quiz;
  const publicQuiz = quiz && quiz.status === 'PUBLISHED' && quiz.visibility === 'PUBLIC';
  return {
    nickname: p.nickname,
    score: p.score,
    correct: p.correctCount,
    total,
    percent: attemptPercent(p.correctCount, total),
    bestStreak: p.bestStreak,
    rank: p.game.soloKey ? null : p.finalRank,
    players: p.game.soloKey ? null : p.game.playerCount,
    mode: p.game.mode,
    quizTitle: quiz?.title ?? null,
    quizId: publicQuiz ? quiz.id : null,
    endedAt: p.game.endedAt?.toISOString() ?? null,
  };
}

export type ShareResult = NonNullable<Awaited<ReturnType<typeof getShareResult>>>;
