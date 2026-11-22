// Catálogo de los 14 tipos de pregunta de Quiz_Rush.

export const QUESTION_TYPES = [
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'TYPE_ANSWER',
  'ORDER',
  'MATCH',
  'SLIDER',
  'PIN',
  'FILL_BLANK',
  'AUDIO',
  'REVEAL_IMAGE',
  'POLL',
  'WORD_CLOUD',
  'OPEN_VOTE',
  'DRAW',
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Tipos disponibles en el editor (desde la Fase 4, todos). */
export const EDITOR_ENABLED_TYPES: readonly QuestionType[] = QUESTION_TYPES;

/** Tipos que no tienen respuesta correcta (no suman puntos por acierto). */
export const UNSCORED_TYPES: readonly QuestionType[] = ['POLL', 'WORD_CLOUD', 'OPEN_VOTE'];

/** Tipos que usan la lista de opciones (Option) de la pregunta. */
export const OPTION_BASED_TYPES: readonly QuestionType[] = [
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'ORDER',
  'AUDIO',
  'REVEAL_IMAGE',
  'POLL',
];

/** Emoji representativo de cada tipo (el nombre se traduce en messages/*.json → questionTypes). */
export const QUESTION_TYPE_EMOJI: Record<QuestionType, string> = {
  MULTIPLE_CHOICE: '🔠',
  TRUE_FALSE: '✅',
  TYPE_ANSWER: '⌨️',
  ORDER: '🔢',
  MATCH: '🔗',
  SLIDER: '🎚️',
  PIN: '📍',
  FILL_BLANK: '✏️',
  AUDIO: '🎧',
  REVEAL_IMAGE: '🧩',
  POLL: '📊',
  WORD_CLOUD: '☁️',
  OPEN_VOTE: '🗳️',
  DRAW: '🎨',
};
