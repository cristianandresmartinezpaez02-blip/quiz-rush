// Cliente de Claude (API de Anthropic) para las funciones de IA de Quiz_Rush.
//
//  • Sin ANTHROPIC_API_KEY la IA queda desactivada (la interfaz lo explica).
//  • AI_MOCK=1 activa un modo simulado sin llamadas reales (pruebas automáticas y demos).
//  • Cada llamada queda registrada en AiRequest (cupo diario por persona y tokens = coste).
//  • Al API solo se envía el contenido del quiz o del material: nunca el correo ni el nombre.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '@quiz-rush/db';
import { ApiError } from '../api';

export type AiStatus = 'live' | 'mock' | 'off';
export type AiKind = 'GENERATE' | 'DISTRACTORS' | 'EXPLANATION' | 'MODERATION';

/** Modelo por defecto: Claude Opus 5.5 (se puede cambiar con AI_MODEL). */
export const AI_MODEL = process.env.AI_MODEL || 'claude-opus-5-5';

export function aiStatus(): AiStatus {
  if (process.env.AI_MOCK === '1') return 'mock';
  return process.env.ANTHROPIC_API_KEY ? 'live' : 'off';
}

const globalForAi = globalThis as unknown as { __quizRushAnthropic?: Anthropic };

export function anthropic(): Anthropic {
  globalForAi.__quizRushAnthropic ??= new Anthropic({
    // Generar 20 preguntas con razonamiento puede tardar; 3 minutos por intento
    timeout: 180_000,
    maxRetries: 2,
  });
  return globalForAi.__quizRushAnthropic;
}

/** Usos diarios por persona (configurables). */
const DAILY_LIMITS: Record<AiKind, number> = {
  GENERATE: Number(process.env.AI_DAILY_GENERATIONS) || 20,
  DISTRACTORS: Number(process.env.AI_DAILY_ASSISTS) || 100,
  EXPLANATION: Number(process.env.AI_DAILY_ASSISTS) || 100,
  MODERATION: Number.POSITIVE_INFINITY,
};

/** Lanza 503 si la IA está apagada y 429 si se agotó el cupo del día. */
export async function assertAiAvailable(userId: string, kind: AiKind) {
  if (aiStatus() === 'off') throw new ApiError(503, 'AI_DISABLED');
  const limit = DAILY_LIMITS[kind];
  if (!Number.isFinite(limit)) return;
  const since = new Date(Date.now() - 24 * 3_600_000);
  const used = await db.aiRequest.count({
    where: {
      userId,
      createdAt: { gte: since },
      ...(kind === 'GENERATE' ? { kind } : { kind: { in: ['DISTRACTORS', 'EXPLANATION'] } }),
      status: { not: 'FAILED' },
    },
  });
  if (used >= limit) throw new ApiError(429, 'AI_QUOTA', { limit });
}

export async function remainingGenerations(userId: string) {
  const since = new Date(Date.now() - 24 * 3_600_000);
  const used = await db.aiRequest.count({
    where: { userId, kind: 'GENERATE', createdAt: { gte: since }, status: { not: 'FAILED' } },
  });
  return Math.max(0, DAILY_LIMITS.GENERATE - used);
}

export async function logAiRequest(entry: {
  userId: string;
  kind: AiKind;
  status: 'OK' | 'REFUSED' | 'FAILED' | 'INVALID';
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs: number;
}) {
  await db.aiRequest
    .create({
      data: {
        ...entry,
        inputTokens: entry.inputTokens ?? 0,
        outputTokens: entry.outputTokens ?? 0,
      },
    })
    .catch((err) => console.error('[ia] no se pudo registrar el uso:', err));
}

/** Traduce los errores del SDK a códigos de la API de Quiz_Rush (los más específicos primero). */
export function mapAiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.PermissionDeniedError
  ) {
    console.error('[ia] credenciales del API de Anthropic no válidas');
    return new ApiError(503, 'AI_MISCONFIGURED');
  }
  if (err instanceof Anthropic.RateLimitError) return new ApiError(503, 'AI_BUSY');
  if (err instanceof Anthropic.BadRequestError) {
    console.error('[ia] petición rechazada:', err.message);
    return new ApiError(422, 'AI_BAD_INPUT');
  }
  if (err instanceof Anthropic.APIConnectionError) return new ApiError(503, 'AI_UNAVAILABLE');
  if (err instanceof Anthropic.APIError) {
    console.error(`[ia] error ${err.status}:`, err.message);
    return new ApiError(503, 'AI_UNAVAILABLE');
  }
  console.error('[ia] error inesperado:', err);
  return new ApiError(500, 'AI_FAILED');
}
