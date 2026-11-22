// Validación de completitud: decide si un quiz está listo para entrar en la Biblioteca.
// Devuelve códigos de error (no textos) para que el frontend los traduzca.
import { LIMITS } from '../constants';
import { findProfanity } from '../moderation/profanity';
import type { QuestionDoc, QuizDoc } from './schemas';

export type IssueCode =
  | 'TITLE_SHORT'
  | 'TITLE_OFFENSIVE'
  | 'NO_QUESTIONS'
  | 'PROMPT_EMPTY'
  | 'PROMPT_OFFENSIVE'
  | 'OPTIONS_MIN'
  | 'OPTION_EMPTY'
  | 'NO_CORRECT'
  | 'TOO_MANY_CORRECT'
  | 'ACCEPTED_EMPTY'
  | 'MEDIA_REQUIRED'
  | 'SLIDER_INVALID'
  | 'PAIRS_MIN'
  | 'PAIR_EMPTY'
  | 'PIN_MISSING'
  | 'BLANKS_MISMATCH'
  | 'DRAW_WORDS_EMPTY';

export interface ValidationIssue {
  code: IssueCode;
  /** Pregunta afectada (ausente si el problema es del quiz) */
  questionId?: string;
}

const filled = (s: string | null | undefined) => !!s && s.trim().length > 0;

/** Problemas de una pregunta individual. Lista vacía = pregunta válida. */
export function validateQuestion(q: QuestionDoc): ValidationIssue[] {
  const issues: IssueCode[] = [];
  if (!filled(q.prompt)) issues.push('PROMPT_EMPTY');
  else if (findProfanity(q.prompt)) issues.push('PROMPT_OFFENSIVE');

  const correctCount = q.options.filter((o) => o.isCorrect).length;
  const checkOptions = (min: number) => {
    if (q.options.length < min) issues.push('OPTIONS_MIN');
    if (q.options.some((o) => !filled(o.text) && !o.imageUrl)) issues.push('OPTION_EMPTY');
  };

  switch (q.type) {
    case 'MULTIPLE_CHOICE':
    case 'AUDIO':
    case 'REVEAL_IMAGE':
      checkOptions(LIMITS.options.min);
      if (q.options.length > LIMITS.options.max) issues.push('OPTIONS_MIN');
      if (correctCount === 0) issues.push('NO_CORRECT');
      if (!q.config.multiSelect && correctCount > 1) issues.push('TOO_MANY_CORRECT');
      if (q.type === 'AUDIO' && q.media?.kind !== 'audio' && q.media?.kind !== 'youtube')
        issues.push('MEDIA_REQUIRED');
      if (q.type === 'REVEAL_IMAGE' && q.media?.kind !== 'image') issues.push('MEDIA_REQUIRED');
      break;
    case 'TRUE_FALSE':
      if (q.options.length !== 2) issues.push('OPTIONS_MIN');
      if (correctCount !== 1) issues.push('NO_CORRECT');
      break;
    case 'POLL':
      checkOptions(LIMITS.options.min);
      break;
    case 'TYPE_ANSWER':
      if (!(q.config.accepted ?? []).some(filled)) issues.push('ACCEPTED_EMPTY');
      break;
    case 'ORDER':
      checkOptions(LIMITS.orderItems.min);
      break;
    case 'MATCH': {
      const pairs = q.config.pairs ?? [];
      if (pairs.length < LIMITS.matchPairs.min) issues.push('PAIRS_MIN');
      if (pairs.some((p) => !filled(p.left) || !filled(p.right))) issues.push('PAIR_EMPTY');
      break;
    }
    case 'SLIDER': {
      const s = q.config.slider;
      if (!s || s.min >= s.max || s.correct < s.min || s.correct > s.max)
        issues.push('SLIDER_INVALID');
      break;
    }
    case 'PIN':
      if (!q.config.pin) issues.push('PIN_MISSING');
      break;
    case 'FILL_BLANK': {
      const holes = (q.prompt.match(/_{3,}/g) ?? []).length;
      const blanks = q.config.blanks ?? [];
      if (holes === 0 || holes !== blanks.length || blanks.some((b) => !b.some(filled)))
        issues.push('BLANKS_MISMATCH');
      break;
    }
    case 'DRAW':
      if (!(q.config.drawWords ?? []).some(filled)) issues.push('DRAW_WORDS_EMPTY');
      break;
    case 'WORD_CLOUD':
    case 'OPEN_VOTE':
      break;
  }
  return [...new Set(issues)].map((code) => ({ code, questionId: q.id }));
}

/** Todos los problemas del quiz (título + cada pregunta). */
export function validateQuiz(doc: QuizDoc): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (doc.title.trim().length < LIMITS.quizTitle.min) issues.push({ code: 'TITLE_SHORT' });
  else if (findProfanity(doc.title)) issues.push({ code: 'TITLE_OFFENSIVE' });
  if (doc.questions.length === 0) issues.push({ code: 'NO_QUESTIONS' });
  for (const q of doc.questions) issues.push(...validateQuestion(q));
  return issues;
}

/** Un quiz es publicable cuando tiene título válido y todas sus preguntas son válidas. */
export function isPublishable(doc: QuizDoc): boolean {
  return validateQuiz(doc).length === 0;
}

/** Duración estimada del quiz en segundos (suma de tiempos + ~5 s de revelado por pregunta). */
export function estimateDurationSeconds(doc: Pick<QuizDoc, 'questions'>): number {
  return doc.questions.reduce((acc, q) => acc + q.timeLimit + 5, 0);
}
