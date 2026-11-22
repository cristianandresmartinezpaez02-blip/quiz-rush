// Trabajos en segundo plano (Fase 8). Los ejecuta `apps/worker` con BullMQ: programa los
// periódicos y reparte los puntuales, con reintentos. La lógica vive en la web (rutas internas
// /api/internal/jobs/<nombre>), así no se duplica código entre servicios.

export const JOB_QUEUE = 'quizrush-jobs';

/** Clave de Redis con la que el worker anuncia que está vivo (caduca si se cae). */
export const WORKER_HEARTBEAT_KEY = 'worker:heartbeat';
export const WORKER_HEARTBEAT_TTL_SECONDS = 30;

export const JOB_NAMES = [
  'push', // envía las notificaciones push pendientes
  'moderation', // revisión con IA de los quizzes publicados pendientes
  'trending', // recalcula la puntuación de tendencia de la Biblioteca
  'league-close', // cierra la semana anterior de las ligas (idempotente)
  'cleanup', // limpieza diaria (avisos antiguos ya leídos, sesiones caducadas…)
  'notify-followers', // avisa a los seguidores de un creador (por lotes de 1.000)
  'search-index', // sincroniza un quiz con el buscador externo (Meilisearch), si está activo
] as const;
export type JobName = (typeof JOB_NAMES)[number];

/** Trabajos periódicos y cada cuánto se ejecutan (milisegundos). */
export const JOB_SCHEDULES: Partial<Record<JobName, number>> = {
  push: 10_000,
  moderation: 120_000,
  trending: 600_000,
  'league-close': 3_600_000,
  cleanup: 86_400_000,
};

export interface NotifyFollowersJob {
  authorId: string;
  quizId: string;
  quizTitle: string;
  /** Último seguidor procesado (paginación por cursor) */
  cursor?: string;
}

export interface SearchIndexJob {
  quizId: string;
}

/** Respuesta de una ruta interna de trabajo. `next` = datos para encolar el siguiente lote. */
export interface JobResult {
  ok: true;
  /** Lo que hizo (para métricas y registros) */
  done?: number;
  next?: Record<string, unknown> | null;
}
