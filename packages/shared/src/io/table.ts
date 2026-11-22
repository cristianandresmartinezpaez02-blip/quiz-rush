// Importar y exportar quizzes como tabla (CSV o Excel). Una fila = una pregunta.
// Las columnas tienen nombre en español o inglés; el tipo se acepta por código o por nombre.
//
//  Tipo | Pregunta | Opción 1…6 | Correctas | Respuestas aceptadas | Tiempo (s) | Puntos | Pista |
//  Explicación | Multimedia (URL)
//
// Cómo se usa cada columna según el tipo:
//  • Opción múltiple, V/F, encuesta, audio, imagen revelada: opciones + "Correctas" = 1,3
//  • Respuesta escrita: "Respuestas aceptadas" = variantes separadas por |
//  • Ordenar: opciones en el orden correcto
//  • Emparejar: cada opción "izquierda => derecha"
//  • Deslizador: Opción 1 mín · 2 máx · 3 paso · 4 tolerancia · 5 unidad; "Correctas" = valor
//  • Completar espacios: "Respuestas aceptadas" = un grupo por ___ separado por ; (variantes con |)
//  • Nube de palabras: Opción 1 = máximo de palabras · Dibujo: opciones = palabras
//  • Pin en imagen: no se puede representar en una tabla (necesita la imagen)
import { LIMITS, type PointsMode, POINTS_MODES } from '../constants';
import { newId } from '../ids';
import { createOption, createQuestion } from '../questions/defaults';
import type { QuestionDoc } from '../questions/schemas';
import { QUESTION_TYPES, type QuestionType } from '../questions/types';

export const TABLE_OPTION_COLUMNS = 6;

export const TABLE_COLUMNS = [
  'type',
  'prompt',
  'option1',
  'option2',
  'option3',
  'option4',
  'option5',
  'option6',
  'correct',
  'accepted',
  'time',
  'points',
  'hint',
  'explanation',
  'media',
] as const;
export type TableColumn = (typeof TABLE_COLUMNS)[number];

const HEADER_LABELS: Record<'es' | 'en', Record<TableColumn, string>> = {
  es: {
    type: 'Tipo',
    prompt: 'Pregunta',
    option1: 'Opción 1',
    option2: 'Opción 2',
    option3: 'Opción 3',
    option4: 'Opción 4',
    option5: 'Opción 5',
    option6: 'Opción 6',
    correct: 'Correctas',
    accepted: 'Respuestas aceptadas',
    time: 'Tiempo (s)',
    points: 'Puntos',
    hint: 'Pista',
    explanation: 'Explicación',
    media: 'Multimedia (URL)',
  },
  en: {
    type: 'Type',
    prompt: 'Question',
    option1: 'Option 1',
    option2: 'Option 2',
    option3: 'Option 3',
    option4: 'Option 4',
    option5: 'Option 5',
    option6: 'Option 6',
    correct: 'Correct',
    accepted: 'Accepted answers',
    time: 'Time (s)',
    points: 'Points',
    hint: 'Hint',
    explanation: 'Explanation',
    media: 'Media (URL)',
  },
};

/** Nombre visible de cada tipo en la tabla (también se acepta el código). */
const TYPE_LABELS: Record<'es' | 'en', Record<QuestionType, string>> = {
  es: {
    MULTIPLE_CHOICE: 'Opción múltiple',
    TRUE_FALSE: 'Verdadero o falso',
    TYPE_ANSWER: 'Respuesta escrita',
    ORDER: 'Ordenar',
    MATCH: 'Emparejar',
    SLIDER: 'Deslizador',
    PIN: 'Pin en imagen',
    FILL_BLANK: 'Completar espacios',
    AUDIO: 'Audio',
    REVEAL_IMAGE: 'Imagen revelada',
    POLL: 'Encuesta',
    WORD_CLOUD: 'Nube de palabras',
    OPEN_VOTE: 'Abierta con votación',
    DRAW: 'Dibujo',
  },
  en: {
    MULTIPLE_CHOICE: 'Multiple choice',
    TRUE_FALSE: 'True or false',
    TYPE_ANSWER: 'Type answer',
    ORDER: 'Order',
    MATCH: 'Match',
    SLIDER: 'Slider',
    PIN: 'Pin on image',
    FILL_BLANK: 'Fill in the blank',
    AUDIO: 'Audio',
    REVEAL_IMAGE: 'Reveal image',
    POLL: 'Poll',
    WORD_CLOUD: 'Word cloud',
    OPEN_VOTE: 'Open with voting',
    DRAW: 'Draw',
  },
};

/** Normaliza un texto para compararlo (sin tildes, mayúsculas ni signos). */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

const TYPE_LOOKUP = new Map<string, QuestionType>();
for (const t of QUESTION_TYPES) {
  TYPE_LOOKUP.set(norm(t), t);
  TYPE_LOOKUP.set(norm(TYPE_LABELS.es[t]), t);
  TYPE_LOOKUP.set(norm(TYPE_LABELS.en[t]), t);
}
// Atajos habituales
for (const [alias, t] of [
  ['vf', 'TRUE_FALSE'],
  ['tf', 'TRUE_FALSE'],
  ['multiple', 'MULTIPLE_CHOICE'],
  ['quiz', 'MULTIPLE_CHOICE'],
  ['escrita', 'TYPE_ANSWER'],
  ['texto', 'TYPE_ANSWER'],
  ['completar', 'FILL_BLANK'],
  ['nube', 'WORD_CLOUD'],
] as const) {
  TYPE_LOOKUP.set(alias, t);
}

const HEADER_LOOKUP = new Map<string, TableColumn>();
for (const lang of ['es', 'en'] as const) {
  for (const c of TABLE_COLUMNS) HEADER_LOOKUP.set(norm(HEADER_LABELS[lang][c]), c);
}
for (const [alias, c] of [
  ['respuestacorrecta', 'correct'],
  ['correcta', 'correct'],
  ['tiempo', 'time'],
  ['time', 'time'],
  ['multimedia', 'media'],
  ['imagen', 'media'],
] as const) {
  HEADER_LOOKUP.set(alias, c);
}

export function tableHeaders(lang: 'es' | 'en'): string[] {
  return TABLE_COLUMNS.map((c) => HEADER_LABELS[lang][c]);
}

export function typeLabel(type: QuestionType, lang: 'es' | 'en'): string {
  return TYPE_LABELS[lang][type];
}

// ───────────────────────── Exportar ─────────────────────────

/** Una pregunta como fila de la tabla. */
export function questionToRow(q: QuestionDoc, lang: 'es' | 'en'): string[] {
  const cells: Partial<Record<TableColumn, string>> = {
    type: TYPE_LABELS[lang][q.type],
    prompt: q.prompt,
    time: String(q.timeLimit),
    points: q.points,
    hint: q.hint ?? '',
    explanation: q.explanation ?? '',
    media: q.media?.url ?? '',
  };
  const setOptions = (values: string[]) =>
    values
      .slice(0, TABLE_OPTION_COLUMNS)
      .forEach((v, i) => (cells[`option${i + 1}` as TableColumn] = v));

  switch (q.type) {
    case 'TYPE_ANSWER':
      cells.accepted = (q.config.accepted ?? []).filter(Boolean).join(' | ');
      break;
    case 'ORDER':
      setOptions(q.options.map((o) => o.text));
      break;
    case 'MATCH':
      setOptions((q.config.pairs ?? []).map((p) => `${p.left} => ${p.right}`));
      break;
    case 'SLIDER': {
      const s = q.config.slider;
      if (s) {
        setOptions([
          String(s.min),
          String(s.max),
          String(s.step),
          String(s.tolerance),
          s.unit ?? '',
        ]);
        cells.correct = String(s.correct);
      }
      break;
    }
    case 'FILL_BLANK':
      cells.accepted = (q.config.blanks ?? [])
        .map((b) => b.filter(Boolean).join(' | '))
        .join(' ; ');
      break;
    case 'WORD_CLOUD':
      setOptions([String(q.config.maxWords ?? 3)]);
      break;
    case 'DRAW':
      setOptions(q.config.drawWords ?? []);
      break;
    case 'PIN':
    case 'OPEN_VOTE':
      break;
    default:
      // Opción múltiple, V/F, encuesta, audio, imagen revelada
      setOptions(q.options.map((o) => o.text));
      cells.correct = q.options
        .map((o, i) => (o.isCorrect ? String(i + 1) : null))
        .filter(Boolean)
        .join(',');
  }
  return TABLE_COLUMNS.map((c) => cells[c] ?? '');
}

export function quizToTable(questions: QuestionDoc[], lang: 'es' | 'en'): string[][] {
  return [tableHeaders(lang), ...questions.map((q) => questionToRow(q, lang))];
}

// ───────────────────────── Importar ─────────────────────────

export type ImportErrorCode =
  | 'UNKNOWN_TYPE'
  | 'EMPTY_PROMPT'
  | 'NOT_ENOUGH_OPTIONS'
  | 'BAD_CORRECT'
  | 'BAD_NUMBER'
  | 'PIN_NOT_SUPPORTED'
  | 'TOO_MANY_QUESTIONS';

export interface ImportResult {
  questions: QuestionDoc[];
  /** Filas que no se pudieron importar (número de fila de la hoja, empezando en 1) */
  errors: { row: number; code: ImportErrorCode }[];
}

const splitList = (s: string, sep: RegExp) =>
  s
    .split(sep)
    .map((x) => x.trim())
    .filter(Boolean);

const num = (s: string | undefined): number | null => {
  if (s === undefined || s.trim() === '') return null;
  const n = Number(s.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Mapa columna → índice a partir de la fila de encabezados (o el orden estándar si no la hay). */
function headerMap(row: string[]): { map: Map<TableColumn, number>; isHeader: boolean } {
  const map = new Map<TableColumn, number>();
  row.forEach((cell, i) => {
    const col = HEADER_LOOKUP.get(norm(cell ?? ''));
    if (col && !map.has(col)) map.set(col, i);
  });
  if (map.has('type') && map.has('prompt')) return { map, isHeader: true };
  return { map: new Map(TABLE_COLUMNS.map((c, i) => [c, i])), isHeader: false };
}

/** Convierte una fila en pregunta (o en un código de error). */
export function rowToQuestion(
  get: (c: TableColumn) => string,
  lang: 'es' | 'en',
): QuestionDoc | ImportErrorCode {
  const type = TYPE_LOOKUP.get(norm(get('type')));
  if (!type) return 'UNKNOWN_TYPE';
  if (type === 'PIN') return 'PIN_NOT_SUPPORTED';
  const prompt = get('prompt').trim();
  if (!prompt) return 'EMPTY_PROMPT';

  const q = createQuestion(type, lang);
  q.prompt = prompt.slice(0, LIMITS.questionPrompt.max);
  const time = num(get('time'));
  if (time !== null) {
    q.timeLimit = Math.min(LIMITS.timeLimit.max, Math.max(LIMITS.timeLimit.min, Math.round(time)));
  }
  const points = get('points').trim().toUpperCase();
  if ((POINTS_MODES as readonly string[]).includes(points) && q.points !== 'NONE') {
    q.points = points as PointsMode;
  }
  q.hint = get('hint').trim().slice(0, LIMITS.hint.max) || null;
  q.explanation = get('explanation').trim().slice(0, LIMITS.explanation.max) || null;
  const media = get('media').trim();
  if (/^https?:\/\//i.test(media)) {
    const kind = /youtu\.?be/.test(media)
      ? 'youtube'
      : /\.(mp3|ogg|wav|m4a)(\?|$)/i.test(media)
        ? 'audio'
        : /\.gif(\?|$)/i.test(media)
          ? 'gif'
          : 'image';
    q.media = { kind, url: media.slice(0, 2048) };
  }

  const options = Array.from({ length: TABLE_OPTION_COLUMNS }, (_, i) =>
    get(`option${i + 1}` as TableColumn).trim(),
  ).filter(Boolean);
  const text = (s: string) => s.slice(0, LIMITS.optionText.max);

  switch (type) {
    case 'TYPE_ANSWER': {
      const accepted = splitList(get('accepted'), /\|/).map(text);
      if (!accepted.length) return 'BAD_CORRECT';
      q.config = { accepted: accepted.slice(0, LIMITS.acceptedAnswers.max) };
      break;
    }
    case 'ORDER':
      if (options.length < LIMITS.orderItems.min) return 'NOT_ENOUGH_OPTIONS';
      q.options = options.slice(0, LIMITS.orderItems.max).map((o) => createOption(text(o)));
      break;
    case 'MATCH': {
      const pairs = options
        .map((o) => o.split(/\s*=>\s*|\s*->\s*/))
        .filter((p) => p.length === 2 && p[0] && p[1])
        .map(([left, right]) => ({
          id: newId(),
          left: left!.slice(0, 80),
          right: right!.slice(0, 80),
        }));
      if (pairs.length < LIMITS.matchPairs.min) return 'NOT_ENOUGH_OPTIONS';
      q.config = { pairs: pairs.slice(0, LIMITS.matchPairs.max) };
      break;
    }
    case 'SLIDER': {
      const min = num(options[0]);
      const max = num(options[1]);
      const step = num(options[2]);
      const tolerance = num(options[3]);
      const correct = num(get('correct'));
      if (min === null || max === null || correct === null || min >= max) return 'BAD_NUMBER';
      q.config = {
        slider: {
          min,
          max,
          step: step && step > 0 ? step : 1,
          correct,
          tolerance: tolerance && tolerance >= 0 ? tolerance : 0,
          ...(options[4] && { unit: options[4].slice(0, 12) }),
        },
      };
      break;
    }
    case 'FILL_BLANK': {
      const groups = splitList(get('accepted'), /;/).map((g) =>
        splitList(g, /\|/).map((v) => v.slice(0, 80)),
      );
      if (!groups.length) return 'BAD_CORRECT';
      q.config = { blanks: groups.slice(0, 5) };
      break;
    }
    case 'WORD_CLOUD': {
      const max = num(options[0]);
      q.config = { maxWords: Math.min(5, Math.max(1, Math.round(max ?? 3))) };
      break;
    }
    case 'DRAW':
      if (!options.length) return 'NOT_ENOUGH_OPTIONS';
      q.config = { drawWords: options.map((w) => w.slice(0, 40)) };
      break;
    case 'OPEN_VOTE':
      break;
    default: {
      // Opción múltiple, V/F, encuesta, audio, imagen revelada
      if (type === 'TRUE_FALSE' && options.length === 0) {
        options.push(...(lang === 'en' ? ['True', 'False'] : ['Verdadero', 'Falso']));
      }
      if (options.length < LIMITS.options.min) return 'NOT_ENOUGH_OPTIONS';
      const correct = new Set(
        splitList(get('correct'), /[,;\s]+/)
          .map((c) => Number(c))
          .filter((n) => Number.isInteger(n)),
      );
      if (
        type !== 'POLL' &&
        (correct.size === 0 || [...correct].some((n) => n < 1 || n > options.length))
      ) {
        return 'BAD_CORRECT';
      }
      q.options = options
        .slice(0, type === 'TRUE_FALSE' ? 2 : LIMITS.options.max)
        .map((o, i) => createOption(text(o), type !== 'POLL' && correct.has(i + 1)));
      if (type === 'MULTIPLE_CHOICE' || type === 'AUDIO' || type === 'REVEAL_IMAGE') {
        q.config = { ...q.config, multiSelect: correct.size > 1 };
      }
    }
  }
  return q;
}

/** Tabla completa (con o sin fila de encabezados) → preguntas + errores por fila. */
export function tableToQuestions(rows: string[][], lang: 'es' | 'en'): ImportResult {
  const nonEmpty = rows.filter((r) => r.some((c) => (c ?? '').trim()));
  if (!nonEmpty.length) return { questions: [], errors: [] };
  const { map, isHeader } = headerMap(rows.find((r) => r.some((c) => (c ?? '').trim()))!);
  const questions: QuestionDoc[] = [];
  const errors: ImportResult['errors'] = [];
  rows.forEach((row, index) => {
    if (!row.some((c) => (c ?? '').trim())) return;
    if (isHeader && row === nonEmpty[0]) return;
    const get = (c: TableColumn) => {
      const i = map.get(c);
      return i === undefined ? '' : String(row[i] ?? '');
    };
    if (questions.length >= LIMITS.questionsPerQuiz.max) {
      errors.push({ row: index + 1, code: 'TOO_MANY_QUESTIONS' });
      return;
    }
    const result = rowToQuestion(get, lang);
    if (typeof result === 'string') errors.push({ row: index + 1, code: result });
    else questions.push(result);
  });
  return { questions, errors };
}

// ───────────────────────── CSV ─────────────────────────

/**
 * Inyección de fórmulas: una celda que empieza por = + @ (o por - seguido de algo que no es un
 * número) se ejecutaría como fórmula al abrir el archivo en Excel. Se antepone un apóstrofo para
 * que se lea como texto. Los números negativos (-10) no se tocan.
 */
export function neutralizeFormula(v: string): string {
  return /^[=+@\t\r]/.test(v) || /^-(?![\d.,]+$)/.test(v) ? `'${v}` : v;
}

/** CSV compatible con Excel: separador elegido, comillas cuando hace falta y BOM UTF-8. */
export function toCsv(rows: string[][], sep = ','): string {
  const cell = (raw: string) => {
    const v = neutralizeFormula(raw ?? '');
    return /[",;\n\r]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v;
  };
  return '\uFEFF' + rows.map((r) => r.map(cell).join(sep)).join('\r\n') + '\r\n';
}

/** Lee CSV (RFC 4180): comillas, saltos de línea dentro de celdas y separador , ; o tabulador. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const counts = [',', ';', '\t'].map((s) => [s, firstLine.split(s).length - 1] as const);
  const sep = counts.sort((a, b) => b[1] - a[1])[0]![1] > 0 ? counts[0]![0] : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
