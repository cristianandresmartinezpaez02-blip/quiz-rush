// Generador de quizzes con IA: qué pide el usuario y qué devuelve el modelo.
// La salida del modelo se valida con Zod (salida estructurada) y luego se convierte en preguntas
// del editor, que pasan por las mismas reglas de validación que las escritas a mano.
import { z } from 'zod';
import { CATEGORY_IDS } from '../catalog/categories';
import { DIFFICULTIES, LIMITS } from '../constants';
import { newId } from '../ids';
import { createOption, createQuestion } from '../questions/defaults';
import type { QuestionDoc } from '../questions/schemas';
import { validateQuestion } from '../questions/validation';

/** Tipos que el generador sabe escribir bien sin imágenes ni audio. */
export const AI_QUESTION_TYPES = [
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'TYPE_ANSWER',
  'ORDER',
  'MATCH',
  'SLIDER',
  'FILL_BLANK',
] as const;
export type AiQuestionType = (typeof AI_QUESTION_TYPES)[number];

export const AI_SOURCES = ['topic', 'text', 'pdf', 'url', 'image'] as const;
export type AiSource = (typeof AI_SOURCES)[number];

/** Límites del material de origen (no se recorta en silencio: si se pasa, se avisa). */
export const AI_LIMITS = {
  topicChars: 300,
  textChars: 60_000,
  urlChars: 60_000,
  fileBytes: 10 * 1024 * 1024,
  questions: { min: 3, max: 20, default: 8 },
} as const;

/** Opciones del formulario del generador (el archivo, si lo hay, viaja aparte). */
export const aiGenerateOptionsSchema = z.object({
  source: z.enum(AI_SOURCES),
  /** Tema (source=topic), texto pegado (text) o enlace (url) */
  input: z.string().max(AI_LIMITS.textChars).default(''),
  /** Indicaciones extra opcionales ("para 5.º de primaria", "solo la parte 2"…) */
  instructions: z.string().max(500).default(''),
  count: z.number().int().min(AI_LIMITS.questions.min).max(AI_LIMITS.questions.max).default(8),
  types: z.array(z.enum(AI_QUESTION_TYPES)).min(1).default(['MULTIPLE_CHOICE', 'TRUE_FALSE']),
  difficulty: z.enum(DIFFICULTIES).default('MEDIUM'),
  language: z.enum(['es', 'en']).default('es'),
});
export type AiGenerateOptions = z.infer<typeof aiGenerateOptionsSchema>;

/**
 * Lo que devuelve el modelo. Forma plana y uniforme (los campos que no aplican al tipo van
 * vacíos o null): es más fiable para la salida estructurada que una unión por tipo.
 */
export const aiQuestionSchema = z.object({
  type: z.enum(AI_QUESTION_TYPES),
  prompt: z.string().describe('Enunciado. En completar espacios, cada hueco se escribe ___'),
  options: z
    .array(z.object({ text: z.string(), correct: z.boolean() }))
    .describe(
      'Opción múltiple / V-F: opciones con la correcta marcada. Ordenar: en el orden correcto (correct=false). Otros tipos: []',
    ),
  acceptedAnswers: z
    .array(z.string())
    .describe('Respuesta escrita: variantes aceptadas. Otros tipos: []'),
  blanks: z
    .array(z.array(z.string()))
    .describe(
      'Completar espacios: por cada ___ del enunciado, sus variantes aceptadas. Otros tipos: []',
    ),
  pairs: z
    .array(z.object({ left: z.string(), right: z.string() }))
    .describe('Emparejar: parejas correctas. Otros tipos: []'),
  slider: z
    .object({
      min: z.number(),
      max: z.number(),
      step: z.number(),
      correct: z.number(),
      tolerance: z.number(),
      unit: z.string(),
    })
    .nullable()
    .describe('Deslizador: rango y valor correcto. Otros tipos: null'),
  explanation: z.string().describe('Por qué es correcta (1-2 frases)'),
  hint: z.string().describe('Pista breve que no revele la respuesta'),
  timeLimit: z.number().int().describe('Segundos para responder: 10-60 según dificultad'),
});
export type AiQuestion = z.infer<typeof aiQuestionSchema>;

export const aiQuizSchema = z.object({
  title: z.string().describe('Título atractivo y corto'),
  description: z.string().describe('Una o dos frases sobre el quiz'),
  category: z.enum(CATEGORY_IDS as [string, ...string[]]),
  questions: z.array(aiQuestionSchema),
});
export type AiQuiz = z.infer<typeof aiQuizSchema>;

/** Asistente del editor: distractores y explicaciones. */
export const aiDistractorsSchema = z.object({
  distractors: z.array(z.string()).describe('Respuestas incorrectas pero plausibles'),
});
export const aiExplanationSchema = z.object({
  explanation: z.string().describe('Explicación breve (1-2 frases) de la respuesta correcta'),
});

/** Moderación de un quiz antes de que llegue a la Biblioteca. */
export const AI_MODERATION_REASONS = [
  'hate',
  'harassment',
  'sexual',
  'violence',
  'self_harm',
  'dangerous',
  'personal_data',
  'spam',
] as const;
export const aiModerationSchema = z.object({
  verdict: z
    .enum(['ok', 'review', 'block'])
    .describe('ok: apto; review: dudoso, que lo revise una persona; block: claramente inapropiado'),
  reasons: z.array(z.enum(AI_MODERATION_REASONS)),
  note: z.string().describe('Explicación breve para el equipo de moderación'),
});
export type AiModeration = z.infer<typeof aiModerationSchema>;

// ───────────────────────── Conversión a preguntas del editor ─────────────────────────

const clip = (s: string, max: number) => s.trim().slice(0, max);

/** Pregunta del modelo → pregunta del editor (null si no se puede aprovechar). */
export function aiQuestionToDoc(a: AiQuestion, language: 'es' | 'en'): QuestionDoc | null {
  const q = createQuestion(a.type, language);
  q.prompt = clip(a.prompt, LIMITS.questionPrompt.max);
  q.explanation = clip(a.explanation, LIMITS.explanation.max) || null;
  q.hint = clip(a.hint, LIMITS.hint.max) || null;
  q.timeLimit = Math.min(
    LIMITS.timeLimit.max,
    Math.max(LIMITS.timeLimit.min, Math.round(a.timeLimit || 20)),
  );
  const opts = a.options.filter((o) => o.text.trim());

  switch (a.type) {
    case 'MULTIPLE_CHOICE': {
      const list = opts.slice(0, LIMITS.options.max);
      q.options = list.map((o) => createOption(clip(o.text, LIMITS.optionText.max), o.correct));
      q.config = { multiSelect: list.filter((o) => o.correct).length > 1 };
      break;
    }
    case 'TRUE_FALSE': {
      const trueIsCorrect = opts.find((o) => o.correct)?.text ?? '';
      const isTrue = /^(verdadero|true|cierto|sí|si|yes)$/i.test(trueIsCorrect.trim());
      q.options = q.options.map((o, i) => ({ ...o, isCorrect: i === 0 ? isTrue : !isTrue }));
      break;
    }
    case 'TYPE_ANSWER':
      q.config = {
        accepted: a.acceptedAnswers
          .map((x) => clip(x, LIMITS.optionText.max))
          .filter(Boolean)
          .slice(0, LIMITS.acceptedAnswers.max),
      };
      break;
    case 'ORDER':
      q.options = opts
        .slice(0, LIMITS.orderItems.max)
        .map((o) => createOption(clip(o.text, LIMITS.optionText.max)));
      break;
    case 'MATCH':
      q.config = {
        pairs: a.pairs
          .filter((p) => p.left.trim() && p.right.trim())
          .slice(0, LIMITS.matchPairs.max)
          .map((p) => ({ id: newId(), left: clip(p.left, 80), right: clip(p.right, 80) })),
      };
      break;
    case 'SLIDER': {
      const s = a.slider;
      if (!s) return null;
      q.config = {
        slider: {
          min: s.min,
          max: s.max,
          step: s.step > 0 ? s.step : 1,
          correct: s.correct,
          tolerance: Math.max(0, s.tolerance),
          ...(s.unit.trim() && { unit: clip(s.unit, 12) }),
        },
      };
      break;
    }
    case 'FILL_BLANK':
      q.config = {
        blanks: a.blanks.slice(0, 5).map((b) => b.map((v) => clip(v, 80)).filter(Boolean)),
      };
      break;
  }
  return q;
}

/**
 * Convierte la respuesta del modelo en preguntas del editor y descarta las que no pasan la
 * validación (mejor 7 preguntas buenas que 8 con una rota).
 */
export function aiQuizToQuestions(quiz: AiQuiz, language: 'es' | 'en') {
  const questions: QuestionDoc[] = [];
  let discarded = 0;
  for (const a of quiz.questions.slice(0, LIMITS.questionsPerQuiz.max)) {
    const q = aiQuestionToDoc(a, language);
    if (q && validateQuestion(q).length === 0) questions.push(q);
    else discarded++;
  }
  return { questions, discarded };
}
