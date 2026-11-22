// Corrección de respuestas y datos públicos/revelados de cada tipo de pregunta.
// Se ejecuta SOLO en el servidor: el cliente nunca recibe la respuesta antes de tiempo.
import { containsProfanity } from '../moderation/profanity';
import { UNSCORED_TYPES } from '../questions/types';
import type { QuestionDoc } from '../questions/schemas';
import {
  BASE_POINTS,
  computeAnswerPoints,
  multiSelectCorrectness,
  orderCorrectness,
  sliderCorrectness,
} from '../scoring/classic';
import { matchesAcceptedAnswer, normalizeAnswer } from '../text';
import { seededRandom, shuffle } from './modes';
import type { AnswerPayload } from './settings';
import type {
  GameQuestion,
  PlayerSummary,
  PublicQuestion,
  QuestionExtra,
  RevealExtra,
} from './types';

export interface GradeResult {
  /** 0..1 (crédito parcial) */
  correctness: number;
  /** Claves para la distribución de respuestas (ids de opción, texto normalizado, tramo…) */
  distributionKeys: string[];
  /** La respuesta es válida para este tipo de pregunta */
  valid: boolean;
  /** Código de error si no es válida por su contenido (p. ej. texto ofensivo) */
  error?: string;
}

const invalid = (error?: string): GradeResult => ({
  correctness: 0,
  distributionKeys: [],
  valid: false,
  error,
});

/** Tramos del histograma del deslizador. */
export const SLIDER_BUCKETS = 10;

/** Huecos "___" del enunciado de "Completar espacios". */
export function blankParts(prompt: string): string[] {
  return prompt.split(/_{3,}/);
}

/** Pin: crédito completo en la mitad interior del círculo y decreciente hasta el borde. */
export function pinCorrectness(
  point: { x: number; y: number },
  target: { x: number; y: number; radius: number },
): number {
  const d = Math.hypot(point.x - target.x, point.y - target.y);
  if (d > target.radius) return 0;
  if (d <= target.radius / 2) return 1;
  return Math.round((1 - (d - target.radius / 2) / target.radius) * 100) / 100;
}

/** Corrige una respuesta. No calcula puntos (eso depende del tiempo). */
export function gradeAnswer(q: GameQuestion, answer: AnswerPayload): GradeResult {
  const optionIds = new Set(q.options.map((o) => o.id));
  const correctIds = q.options.filter((o) => o.isCorrect).map((o) => o.id);

  switch (q.type) {
    case 'MULTIPLE_CHOICE':
    case 'TRUE_FALSE':
    case 'AUDIO':
    case 'REVEAL_IMAGE':
    case 'POLL': {
      // Solo ids que existan en la pregunta, sin repetidos
      const chosen = [...new Set(answer.optionIds ?? [])].filter((id) => optionIds.has(id));
      const multi = q.type === 'MULTIPLE_CHOICE' && !!q.config.multiSelect;
      if (chosen.length === 0 || (!multi && chosen.length > 1)) return invalid();
      if (q.type === 'POLL') return { correctness: 0, distributionKeys: chosen, valid: true };
      const correctness = multi
        ? multiSelectCorrectness(chosen, correctIds)
        : correctIds.includes(chosen[0]!)
          ? 1
          : 0;
      return { correctness, distributionKeys: chosen, valid: true };
    }
    case 'TYPE_ANSWER': {
      const text = (answer.text ?? '').trim();
      if (!text) return invalid();
      const ok = matchesAcceptedAnswer(text, q.config.accepted ?? []);
      // En la distribución se agrupan las respuestas iguales (sin tildes ni mayúsculas)
      return {
        correctness: ok ? 1 : 0,
        distributionKeys: [normalizeAnswer(text).slice(0, 40)],
        valid: true,
      };
    }
    case 'ORDER': {
      const order = answer.order ?? [];
      // Debe ser una permutación exacta de los elementos
      if (
        order.length !== q.options.length ||
        new Set(order).size !== order.length ||
        !order.every((id) => optionIds.has(id))
      ) {
        return invalid();
      }
      const c = orderCorrectness(
        order,
        q.options.map((o) => o.id),
      );
      return { correctness: c, distributionKeys: [c >= 1 ? 'correct' : 'wrong'], valid: true };
    }
    case 'MATCH': {
      const pairs = q.config.pairs ?? [];
      const tokens = q.config.matchTokens ?? {};
      const given = answer.pairs ?? {};
      if (Object.keys(given).length === 0) return invalid();
      const hits = pairs.filter((p) => tokens[p.id] && given[p.id] === tokens[p.id]).length;
      const c = pairs.length ? hits / pairs.length : 0;
      return { correctness: c, distributionKeys: [c >= 1 ? 'correct' : 'wrong'], valid: true };
    }
    case 'SLIDER': {
      const s = q.config.slider;
      const v = answer.value;
      if (!s || v === undefined || v < s.min || v > s.max) return invalid();
      const bucket = Math.min(
        SLIDER_BUCKETS - 1,
        Math.floor(((v - s.min) / (s.max - s.min || 1)) * SLIDER_BUCKETS),
      );
      return {
        correctness: sliderCorrectness(v, s.correct, s.tolerance),
        distributionKeys: [`b${bucket}`],
        valid: true,
      };
    }
    case 'PIN': {
      const pin = q.config.pin;
      if (!pin || !answer.point) return invalid();
      return { correctness: pinCorrectness(answer.point, pin), distributionKeys: [], valid: true };
    }
    case 'FILL_BLANK': {
      const blanks = q.config.blanks ?? [];
      const given = answer.blanks ?? [];
      if (given.length !== blanks.length || given.every((g) => !g.trim())) return invalid();
      const hits = blanks.filter((accepted, i) =>
        matchesAcceptedAnswer(given[i] ?? '', accepted),
      ).length;
      const c = blanks.length ? hits / blanks.length : 0;
      return { correctness: c, distributionKeys: [c >= 1 ? 'correct' : 'wrong'], valid: true };
    }
    case 'WORD_CLOUD': {
      const max = q.config.maxWords ?? 3;
      const words = [
        ...new Set(
          (answer.words ?? []).map((w) => normalizeAnswer(w).slice(0, 24)).filter(Boolean),
        ),
      ].slice(0, max);
      // Las palabras ofensivas se descartan en silencio
      const clean = words.filter((w) => !containsProfanity(w, { strict: true }));
      if (clean.length === 0) return invalid(words.length ? 'OFFENSIVE' : undefined);
      return { correctness: 0, distributionKeys: clean, valid: true };
    }
    case 'OPEN_VOTE': {
      const text = (answer.text ?? '').trim();
      if (text.length < 1) return invalid();
      if (containsProfanity(text, { strict: true })) return invalid('OFFENSIVE');
      return { correctness: 0, distributionKeys: [], valid: true };
    }
    case 'DRAW': {
      // La palabra secreta la recibe aparte (meta de la partida); aquí solo se valida el texto
      const text = (answer.text ?? '').trim();
      return text ? { correctness: 0, distributionKeys: [], valid: true } : invalid();
    }
  }
}

/** Puntos base (sin bono de racha) de una respuesta corregida. */
export function answerBasePoints(
  q: GameQuestion,
  correctness: number,
  elapsedMs: number,
  timeLimitMs: number,
  speedEnabled: boolean,
): number {
  if (UNSCORED_TYPES.includes(q.type) || BASE_POINTS[q.points] === 0) return 0;
  return computeAnswerPoints({
    correctness,
    elapsedMs,
    timeLimitMs,
    pointsMode: q.points,
    speedEnabled,
  });
}

/** ¿La pregunta puntúa? (las encuestas y las "sin puntos" no cuentan para la racha) */
export function isScored(q: Pick<GameQuestion, 'type' | 'points'>): boolean {
  return !UNSCORED_TYPES.includes(q.type) && q.points !== 'NONE';
}

/** Datos específicos del tipo que ve el jugador (sin respuestas). */
function publicExtra(
  q: GameQuestion,
  drawer: PlayerSummary | null,
  drawWord: string | null,
): QuestionExtra | null {
  const random = seededRandom(q.id);
  switch (q.type) {
    case 'ORDER': {
      let items = shuffle(
        q.options.map((o) => ({ id: o.id, text: o.text })),
        random,
      );
      // Que nunca aparezca ya ordenado
      if (items.length > 1 && items.every((it, i) => it.id === q.options[i]!.id))
        items = [...items.slice(1), items[0]!];
      return { kind: 'order', items };
    }
    case 'MATCH': {
      const pairs = q.config.pairs ?? [];
      const tokens = q.config.matchTokens ?? {};
      return {
        kind: 'match',
        left: pairs.map((p) => ({ id: p.id, text: p.left })),
        right: shuffle(
          pairs.map((p) => ({ id: tokens[p.id] ?? '', text: p.right })),
          random,
        ),
      };
    }
    case 'SLIDER': {
      const s = q.config.slider!;
      return { kind: 'slider', min: s.min, max: s.max, step: s.step, unit: s.unit };
    }
    case 'PIN':
      return { kind: 'pin', imageUrl: q.config.pin?.imageUrl ?? '' };
    case 'FILL_BLANK':
      return { kind: 'blanks', parts: blankParts(q.prompt) };
    case 'REVEAL_IMAGE':
      return { kind: 'reveal', tiles: q.config.revealTiles ?? 16 };
    case 'WORD_CLOUD':
      return { kind: 'cloud', maxWords: q.config.maxWords ?? 3 };
    case 'OPEN_VOTE':
      return { kind: 'vote' };
    case 'DRAW':
      return { kind: 'draw', wordLength: drawWord?.length ?? 0, drawer };
    default:
      return null;
  }
}

/** Versión pública de la pregunta: sin respuestas correctas ni variantes aceptadas. */
export function toPublicQuestion(
  q: GameQuestion,
  index: number,
  total: number,
  draw: { drawer: PlayerSummary | null; word: string | null } = { drawer: null, word: null },
): PublicQuestion {
  const isChoice = ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'AUDIO', 'REVEAL_IMAGE', 'POLL'].includes(
    q.type,
  );
  return {
    index,
    total,
    type: q.type,
    // En "Completar espacios" el enunciado va troceado en `extra`
    prompt: q.type === 'FILL_BLANK' ? q.prompt.replace(/_{3,}/g, '____') : q.prompt,
    timeLimit: q.timeLimit,
    points: q.points,
    media: q.media,
    options: isChoice ? q.options.map((o) => ({ id: o.id, text: o.text })) : [],
    multiSelect: q.type === 'MULTIPLE_CHOICE' && !!q.config.multiSelect,
    hasHint: !!q.hint,
    extra: publicExtra(q, draw.drawer, draw.word),
  };
}

export interface RevealInput {
  /** Respuestas crudas de la pregunta: playerId → { respuesta, corrección } */
  answers: Record<string, { a: unknown; c: number }>;
  counts: Record<string, number>;
  players: Record<string, PlayerSummary>;
  votes?: Record<string, number>;
  draw?: { word: string | null; drawer: PlayerSummary | null };
}

/** Datos extra de la revelación según el tipo (histograma, taps, nube, votos…). */
export function buildRevealExtra(q: GameQuestion, input: RevealInput): RevealExtra | null {
  const answers = Object.entries(input.answers);
  const full = answers.filter(([, a]) => a.c >= 1).length;
  switch (q.type) {
    case 'ORDER':
      return {
        kind: 'order',
        correct: q.options.map((o) => ({ id: o.id, text: o.text })),
        fullyCorrect: full,
      };
    case 'MATCH':
      return {
        kind: 'match',
        pairs: (q.config.pairs ?? []).map((p) => ({ left: p.left, right: p.right })),
        fullyCorrect: full,
      };
    case 'SLIDER': {
      const s = q.config.slider!;
      const histogram = Array.from(
        { length: SLIDER_BUCKETS },
        (_, i) => input.counts[`b${i}`] ?? 0,
      );
      const values = answers
        .map(([, a]) => (a.a as { v?: number } | null)?.v)
        .filter((v): v is number => typeof v === 'number');
      const average = values.length
        ? Math.round((values.reduce((x, y) => x + y, 0) / values.length) * 100) / 100
        : null;
      return {
        kind: 'slider',
        correct: s.correct,
        tolerance: s.tolerance,
        min: s.min,
        max: s.max,
        unit: s.unit,
        histogram,
        average,
      };
    }
    case 'PIN': {
      const pin = q.config.pin!;
      // Como mucho 400 toques para dibujar el mapa de calor (mensaje pequeño)
      const taps = answers
        .map(([, a]) => (a.a as { pt?: [number, number] } | null)?.pt)
        .filter((p): p is [number, number] => Array.isArray(p))
        .slice(0, 400);
      return { kind: 'pin', x: pin.x, y: pin.y, radius: pin.radius, imageUrl: pin.imageUrl, taps };
    }
    case 'FILL_BLANK':
      return {
        kind: 'blanks',
        parts: blankParts(q.prompt),
        answers: (q.config.blanks ?? []).map((b) => b.find((x) => x.trim()) ?? ''),
      };
    case 'WORD_CLOUD':
      return { kind: 'cloud', words: topWords(input.counts, 60) };
    case 'OPEN_VOTE': {
      const votes = input.votes ?? {};
      const ranked = answers
        .map(([pid, a]) => ({
          pid,
          text: String((a.a as { t?: string } | null)?.t ?? ''),
          votes: votes[pid] ?? 0,
        }))
        .filter((x) => x.text)
        .sort((x, y) => y.votes - x.votes)
        .slice(0, 10);
      return {
        kind: 'vote',
        answers: ranked.map((r) => ({
          text: r.text,
          votes: r.votes,
          nick: input.players[r.pid]?.nick ?? '—',
          avatar: input.players[r.pid]?.avatar ?? '🙂',
        })),
      };
    }
    case 'DRAW':
      return {
        kind: 'draw',
        word: input.draw?.word ?? '',
        drawer: input.draw?.drawer ?? null,
        guessed: full,
      };
    default:
      return null;
  }
}

/** Palabras más repetidas de la nube. */
export function topWords(counts: Record<string, number>, limit: number): [string, number][] {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

/** Convierte una pregunta del documento del quiz en pregunta de partida. */
export function toGameQuestion(q: QuestionDoc): GameQuestion {
  return {
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    timeLimit: q.timeLimit,
    points: q.points,
    media: q.media ?? null,
    hint: q.hint ?? null,
    explanation: q.explanation ?? null,
    options: q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })),
    config: { ...q.config },
  };
}

/**
 * Prepara las preguntas al crear la partida: en "Emparejar" cada elemento derecho recibe un
 * token aleatorio. Así el cliente no puede deducir las parejas comparando ids.
 */
export function prepareGameQuestions(
  questions: GameQuestion[],
  randomToken: () => string,
): GameQuestion[] {
  return questions.map((q) =>
    q.type === 'MATCH'
      ? {
          ...q,
          config: {
            ...q.config,
            matchTokens: Object.fromEntries(
              (q.config.pairs ?? []).map((p) => [p.id, randomToken()]),
            ),
          },
        }
      : q,
  );
}

/** Todos los tipos se pueden jugar en vivo. */
export const LIVE_SUPPORTED_TYPES = [
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
