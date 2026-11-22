// Valores iniciales para crear quizzes y preguntas nuevas en el editor.
import { LIMITS } from '../constants';
import { newId } from '../ids';
import type { OptionDoc, QuestionDoc, QuizDoc } from './schemas';
import type { QuestionType } from './types';

export function createEmptyQuiz(language: QuizDoc['language'] = 'es'): QuizDoc {
  return {
    title: '',
    description: '',
    category: null,
    language,
    difficulty: 'MEDIUM',
    theme: 'space',
    coverUrl: null,
    music: null,
    tags: [],
    questions: [createQuestion('MULTIPLE_CHOICE', language)],
  };
}

export function createOption(text = '', isCorrect = false): OptionDoc {
  return { id: newId(), text, isCorrect, imageUrl: null };
}

/** Crea una pregunta nueva del tipo indicado con valores por defecto razonables. */
export function createQuestion(type: QuestionType, language: string = 'es'): QuestionDoc {
  const base: QuestionDoc = {
    id: newId(),
    type,
    prompt: '',
    timeLimit: LIMITS.timeLimit.default,
    points: 'NORMAL',
    hint: null,
    explanation: null,
    media: null,
    options: [],
    config: {},
  };
  const opt = createOption;

  switch (type) {
    case 'MULTIPLE_CHOICE':
    case 'AUDIO':
      return {
        ...base,
        options: [opt('', true), opt(), opt(), opt()],
        config: { multiSelect: false },
      };
    case 'REVEAL_IMAGE':
      return {
        ...base,
        options: [opt('', true), opt(), opt(), opt()],
        config: { revealTiles: 16 },
      };
    case 'TRUE_FALSE': {
      const en = language === 'en';
      return {
        ...base,
        options: [opt(en ? 'True' : 'Verdadero', true), opt(en ? 'False' : 'Falso')],
      };
    }
    case 'POLL':
      return { ...base, points: 'NONE', options: [opt(), opt()] };
    case 'TYPE_ANSWER':
      return { ...base, config: { accepted: [''] } };
    case 'ORDER':
      return { ...base, options: [opt(), opt(), opt()] };
    case 'MATCH':
      return {
        ...base,
        config: {
          pairs: [
            { id: newId(), left: '', right: '' },
            { id: newId(), left: '', right: '' },
          ],
        },
      };
    case 'SLIDER':
      return {
        ...base,
        config: { slider: { min: 0, max: 100, step: 1, correct: 50, tolerance: 10 } },
      };
    case 'FILL_BLANK':
      return { ...base, config: { blanks: [['']] } };
    case 'WORD_CLOUD':
      return { ...base, points: 'NONE', config: { maxWords: 3 } };
    case 'OPEN_VOTE':
      return { ...base, points: 'NONE', timeLimit: 60 };
    case 'DRAW':
      return { ...base, timeLimit: 60, config: { drawWords: [] } };
    case 'PIN':
      return base;
  }
}

const CHOICE_LIKE: readonly QuestionType[] = ['MULTIPLE_CHOICE', 'POLL', 'AUDIO', 'REVEAL_IMAGE'];

/**
 * Convierte una pregunta a otro tipo conservando lo que se pueda
 * (enunciado, tiempo, pista, explicación, medios y, si aplica, las opciones).
 */
export function changeQuestionType(
  q: QuestionDoc,
  type: QuestionType,
  language = 'es',
): QuestionDoc {
  if (q.type === type) return q;
  const fresh = createQuestion(type, language);
  const keepOptions = CHOICE_LIKE.includes(type) && CHOICE_LIKE.includes(q.type);
  const unscored = fresh.points === 'NONE';
  return {
    ...fresh,
    id: q.id,
    prompt: q.prompt,
    timeLimit: q.timeLimit,
    hint: q.hint,
    explanation: q.explanation,
    media: q.media,
    points: unscored ? 'NONE' : q.points === 'NONE' ? 'NORMAL' : q.points,
    options: keepOptions
      ? q.options.map((o) => ({ ...o, isCorrect: unscored ? false : o.isCorrect }))
      : fresh.options,
  };
}

/** Duplica una pregunta con identificadores nuevos (para "Duplicar" en el editor). */
export function duplicateQuestion(q: QuestionDoc): QuestionDoc {
  return {
    ...structuredClone(q),
    id: newId(),
    options: q.options.map((o) => ({ ...o, id: newId() })),
    config: {
      ...structuredClone(q.config),
      pairs: q.config.pairs?.map((p) => ({ ...p, id: newId() })),
    },
  };
}
