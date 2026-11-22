// Creación de partidas en vivo. La app web solo crea la fila GameSession con una copia
// CONGELADA del quiz publicado; el servidor de tiempo real prepara el estado en Redis,
// reserva el PIN y dirige la partida.
import 'server-only';
import { db, type Prisma } from '@quiz-rush/db';
import {
  gameSettingsSchema,
  LIVE_SUPPORTED_TYPES,
  type GameQuestion,
  type GameSettings,
  type QuestionDoc,
} from '@quiz-rush/shared';
import { ApiError } from './api';

export async function createGame(hostId: string, quizId: string, partial: Partial<GameSettings>) {
  const quiz = await db.quiz.findFirst({
    where: { id: quizId, status: 'PUBLISHED', deletedAt: null },
    select: {
      id: true,
      questions: {
        orderBy: { position: 'asc' },
        include: { options: { orderBy: { position: 'asc' } } },
      },
    },
  });
  if (!quiz) throw new ApiError(404, 'QUIZ_NOT_FOUND');

  const questions: GameQuestion[] = quiz.questions
    .filter((q) => (LIVE_SUPPORTED_TYPES as readonly string[]).includes(q.type))
    .map((q) => {
      const config = (q.config ?? {}) as QuestionDoc['config'];
      return {
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        timeLimit: q.timeLimit,
        points: q.points,
        media: (q.media as GameQuestion['media']) ?? null,
        hint: q.hint,
        explanation: q.explanation,
        options: q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })),
        // Configuración completa del tipo (parejas, deslizador, pin, espacios, palabras…)
        config: { ...config },
      };
    });
  if (questions.length === 0) throw new ApiError(400, 'NO_PLAYABLE_QUESTIONS');

  const settings = gameSettingsSchema.parse(partial);
  const game = await db.gameSession.create({
    data: {
      quizId,
      hostId,
      mode: settings.mode,
      settings: settings as Prisma.InputJsonValue,
      quizSnapshot: { questions } as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return game.id;
}

/** Partida del anfitrión (para la página /host). */
export async function getHostedGame(gameId: string, userId: string) {
  const game = await db.gameSession.findUnique({
    where: { id: gameId },
    select: { id: true, hostId: true, status: true, quiz: { select: { id: true, title: true } } },
  });
  // Solo partidas en vivo de un quiz (las partidas en solitario no tienen pantalla de anfitrión)
  if (!game || game.hostId !== userId || !game.quiz) return null;
  return game;
}
