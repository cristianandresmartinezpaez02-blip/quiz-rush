// Esquemas Zod del documento de quiz que maneja el editor.
// El esquema es "tolerante" (permite borradores incompletos); la completitud
// se comprueba aparte en validation.ts para decidir si el quiz se publica.
import { z } from 'zod';
import { DIFFICULTIES, LANGUAGES, LIMITS, POINTS_MODES } from '../constants';
import { QUESTION_TYPES } from './types';

const id = z.string().min(1).max(64);
const url = z
  .string()
  .max(2048)
  .refine((v) => /^(https?:\/\/|\/)/.test(v), 'URL inválida');

export const mediaSchema = z.object({
  kind: z.enum(['image', 'gif', 'audio', 'youtube']),
  url,
  /** Para YouTube: segundo de inicio y fin del fragmento */
  start: z.number().int().min(0).optional(),
  end: z.number().int().min(0).optional(),
});
export type QuestionMedia = z.infer<typeof mediaSchema>;

export const optionSchema = z.object({
  id,
  text: z.string().max(LIMITS.optionText.max),
  isCorrect: z.boolean(),
  imageUrl: url.nullish(),
});
export type OptionDoc = z.infer<typeof optionSchema>;

/**
 * Configuración específica de cada tipo de pregunta (se guarda como JSON).
 * Todos los campos son opcionales en el borrador.
 */
export const questionConfigSchema = z.object({
  /** Opción múltiple: permitir varias respuestas correctas */
  multiSelect: z.boolean().optional(),
  /** Respuesta escrita: variantes aceptadas */
  accepted: z
    .array(z.string().max(LIMITS.optionText.max))
    .max(LIMITS.acceptedAnswers.max)
    .optional(),
  /** Emparejar */
  pairs: z
    .array(z.object({ id, left: z.string().max(80), right: z.string().max(80) }))
    .max(LIMITS.matchPairs.max)
    .optional(),
  /** Deslizador numérico */
  slider: z
    .object({
      min: z.number(),
      max: z.number(),
      step: z.number().positive(),
      correct: z.number(),
      tolerance: z.number().min(0),
      unit: z.string().max(12).optional(),
    })
    .optional(),
  /** Pin en imagen: coordenadas en porcentaje (0–100) */
  pin: z
    .object({
      imageUrl: url,
      x: z.number().min(0).max(100),
      y: z.number().min(0).max(100),
      radius: z.number().min(1).max(50),
    })
    .optional(),
  /** Completar espacios: variantes aceptadas por cada "___" del enunciado */
  blanks: z
    .array(z.array(z.string().max(80)).max(LIMITS.acceptedAnswers.max))
    .max(5)
    .optional(),
  /** Imagen revelada: número de piezas */
  revealTiles: z.number().int().min(4).max(64).optional(),
  /** Nube de palabras: máximo de palabras por jugador */
  maxWords: z.number().int().min(1).max(5).optional(),
  /** Dibujo rápido: palabras posibles */
  drawWords: z.array(z.string().max(40)).max(20).optional(),
});
export type QuestionConfig = z.infer<typeof questionConfigSchema>;

export const questionSchema = z.object({
  id,
  type: z.enum(QUESTION_TYPES),
  prompt: z.string().max(LIMITS.questionPrompt.max),
  timeLimit: z.number().int().min(LIMITS.timeLimit.min).max(LIMITS.timeLimit.max),
  points: z.enum(POINTS_MODES),
  hint: z.string().max(LIMITS.hint.max).nullish(),
  explanation: z.string().max(LIMITS.explanation.max).nullish(),
  media: mediaSchema.nullish(),
  options: z.array(optionSchema).max(LIMITS.orderItems.max),
  config: questionConfigSchema,
});
export type QuestionDoc = z.infer<typeof questionSchema>;

export const quizSettingsSchema = z.object({
  title: z.string().max(LIMITS.quizTitle.max),
  description: z.string().max(LIMITS.quizDescription.max).nullish(),
  category: z.string().max(40).nullish(),
  language: z.enum(LANGUAGES),
  difficulty: z.enum(DIFFICULTIES),
  theme: z.string().max(40),
  coverUrl: url.nullish(),
  music: z.string().max(40).nullish(),
  tags: z.array(z.string().max(30)).max(10),
});
export type QuizSettings = z.infer<typeof quizSettingsSchema>;

/** Documento completo que el editor envía en cada autoguardado. */
export const quizDocSchema = quizSettingsSchema.extend({
  questions: z.array(questionSchema).max(LIMITS.questionsPerQuiz.max),
});
export type QuizDoc = z.infer<typeof quizDocSchema>;

/** Cuerpo de la petición de autoguardado: incluye la revisión para control de concurrencia. */
export const autosaveRequestSchema = z.object({
  /** Revisión del servidor sobre la que el cliente hizo sus cambios */
  baseRevision: z.number().int().min(0),
  doc: quizDocSchema,
});
export type AutosaveRequest = z.infer<typeof autosaveRequestSchema>;
