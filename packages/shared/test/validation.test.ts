import { describe, expect, it } from 'vitest';
import {
  autosaveRequestSchema,
  changeQuestionType,
  containsProfanity,
  createEmptyQuiz,
  createQuestion,
  isPublishable,
  matchesAcceptedAnswer,
  normalizeAnswer,
  slugify,
  validateQuestion,
  validateQuiz,
  type QuizDoc,
} from '../src';

function completeQuiz(): QuizDoc {
  const quiz = createEmptyQuiz();
  quiz.title = 'Sistema Solar';
  const q = quiz.questions[0]!;
  q.prompt = '¿Cuál es el planeta más grande?';
  q.options.forEach((o, i) => (o.text = ['Júpiter', 'Saturno', 'Tierra', 'Marte'][i]!));
  return quiz;
}

describe('publicación automática', () => {
  it('un quiz nuevo vacío no es publicable', () => {
    const issues = validateQuiz(createEmptyQuiz()).map((i) => i.code);
    expect(issues).toContain('TITLE_SHORT');
    expect(issues).toContain('PROMPT_EMPTY');
    expect(issues).toContain('OPTION_EMPTY');
  });

  it('un quiz con título y preguntas válidas es publicable', () => {
    expect(isPublishable(completeQuiz())).toBe(true);
  });

  it('una sola pregunta inválida impide publicar', () => {
    const quiz = completeQuiz();
    quiz.questions.push(createQuestion('TYPE_ANSWER'));
    expect(isPublishable(quiz)).toBe(false);
  });

  it('rechaza títulos ofensivos', () => {
    const quiz = completeQuiz();
    quiz.title = 'Quiz de mierda';
    expect(validateQuiz(quiz).map((i) => i.code)).toContain('TITLE_OFFENSIVE');
  });

  it('opción múltiple sin respuesta correcta es inválida', () => {
    const q = completeQuiz().questions[0]!;
    q.options.forEach((o) => (o.isCorrect = false));
    expect(validateQuestion(q).map((i) => i.code)).toContain('NO_CORRECT');
  });

  it('una encuesta no necesita respuesta correcta', () => {
    const q = createQuestion('POLL');
    q.prompt = '¿Qué prefieres?';
    q.options[0]!.text = 'Playa';
    q.options[1]!.text = 'Montaña';
    expect(validateQuestion(q)).toEqual([]);
  });

  it('completar espacios exige una respuesta por cada hueco', () => {
    const q = createQuestion('FILL_BLANK');
    q.prompt = 'La capital de Francia es ___ y la de Italia es ___';
    q.config.blanks = [['París']];
    expect(validateQuestion(q).map((i) => i.code)).toContain('BLANKS_MISMATCH');
    q.config.blanks = [['París', 'Paris'], ['Roma']];
    expect(validateQuestion(q)).toEqual([]);
  });

  it('el esquema de autoguardado acepta un borrador recién creado', () => {
    expect(
      autosaveRequestSchema.safeParse({ baseRevision: 0, doc: createEmptyQuiz() }).success,
    ).toBe(true);
  });
});

describe('cambio de tipo de pregunta', () => {
  it('conserva el enunciado y convierte a encuesta sin correctas', () => {
    const q = completeQuiz().questions[0]!;
    const poll = changeQuestionType(q, 'POLL');
    expect(poll.id).toBe(q.id);
    expect(poll.prompt).toBe(q.prompt);
    expect(poll.points).toBe('NONE');
    expect(poll.options.every((o) => !o.isCorrect)).toBe(true);
  });
});

describe('texto', () => {
  it('normaliza mayúsculas, tildes y signos', () => {
    expect(normalizeAnswer('  ¡Océano   PACÍFICO! ')).toBe('oceano pacifico');
  });

  it('acepta variantes de respuesta escrita', () => {
    expect(matchesAcceptedAnswer('jupiter', ['Júpiter'])).toBe(true);
    expect(matchesAcceptedAnswer('Saturno', ['Júpiter'])).toBe(false);
    expect(matchesAcceptedAnswer('   ', ['Júpiter'])).toBe(false);
  });

  it('genera slugs', () => {
    expect(slugify('¿Sistema Solar 2026?')).toBe('sistema-solar-2026');
  });
});

describe('filtro de palabras ofensivas', () => {
  it('detecta groserías con tildes, leetspeak y separadores', () => {
    expect(containsProfanity('eres un pendejo')).toBe(true);
    expect(containsProfanity('m1erd4')).toBe(true);
    expect(containsProfanity('el_puto_amo')).toBe(true);
    expect(containsProfanity('f u c k')).toBe(true);
  });

  it('no bloquea palabras legítimas (problema Scunthorpe)', () => {
    expect(containsProfanity('computadora')).toBe(false);
    expect(containsProfanity('Volumen de un cono')).toBe(false);
    expect(containsProfanity('La Alemania nazi')).toBe(false);
    expect(containsProfanity('Shitake')).toBe(false);
  });

  it('el modo estricto bloquea términos ambiguos en apodos', () => {
    expect(containsProfanity('nazi_power', { strict: true })).toBe(true);
    expect(containsProfanity('ProGamer', { strict: true })).toBe(false);
  });
});

describe('biblioteca y comunidad', async () => {
  const { libraryQuerySchema, hasLibraryFilters, bayesianRating, trendingScore, commentSchema } =
    await import('../src');

  it('acepta parámetros vacíos de la URL y los ignora', () => {
    const q = libraryQuerySchema.parse({ q: '', category: '', sort: '' });
    expect(hasLibraryFilters(q)).toBe(false);
  });

  it('rechaza filtros inventados', () => {
    expect(libraryQuerySchema.safeParse({ category: 'hackeo' }).success).toBe(false);
    expect(libraryQuerySchema.safeParse({ type: 'NOPE' }).success).toBe(false);
  });

  it('la media bayesiana premia la cantidad de votos', () => {
    expect(bayesianRating(5, 1)).toBeLessThan(bayesianRating(4.8 * 500, 500));
  });

  it('la tendencia baja con el tiempo a igual actividad', () => {
    const base = { plays: 100, favorites: 10, ratings: 5, ratingAvg: 4, comments: 2 };
    expect(trendingScore({ ...base, hoursSincePublish: 1 })).toBeGreaterThan(
      trendingScore({ ...base, hoursSincePublish: 100 }),
    );
  });

  it('bloquea comentarios ofensivos', () => {
    expect(commentSchema.safeParse({ body: 'eres un pendejo' }).success).toBe(false);
    expect(commentSchema.safeParse({ body: '¡Me encantó este quiz!' }).success).toBe(true);
  });
});
