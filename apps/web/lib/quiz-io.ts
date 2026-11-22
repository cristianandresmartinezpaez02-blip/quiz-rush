// Importar y exportar quizzes en CSV o Excel (una fila por pregunta; ver packages/shared/io/table).
import 'server-only';
import ExcelJS from 'exceljs';
import {
  createEmptyQuiz,
  createOption,
  createQuestion,
  newId,
  parseCsv,
  quizToTable,
  tableToQuestions,
  toCsv,
  type ImportResult,
  type QuestionDoc,
} from '@quiz-rush/shared';
import { ApiError } from './api';
import { createQuiz, getQuizForEditor } from './quiz-service';

export type TableFormat = 'csv' | 'xlsx';

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/** Libro de Excel con una hoja; todas las celdas como texto (nunca fórmulas). */
async function toXlsx(rows: string[][], sheetName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Quiz_Rush';
  const ws = wb.addWorksheet(sheetName.slice(0, 31) || 'Quiz');
  for (const row of rows) ws.addRow(row.map((v) => ({ richText: [{ text: v ?? '' }] })));
  // Encabezados en negrita, fila fija y anchos razonables
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.columns.forEach((col, i) => (col.width = i === 1 ? 50 : i === 0 ? 20 : 18));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Texto de una celda de Excel, sea del tipo que sea (texto, número, fórmula, enlace…). */
function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('text' in v && typeof v.text === 'string') return v.text;
    if ('result' in v) return String(v.result ?? ''); // fórmula: se usa el resultado, nunca la fórmula
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v);
}

async function readXlsx(data: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data as unknown as ArrayBuffer);
  } catch {
    throw new ApiError(400, 'IMPORT_INVALID_FILE');
  }
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const cells: string[] = [];
    for (let c = 1; c <= Math.max(row.cellCount, 15); c++) cells.push(cellText(row.getCell(c)));
    rows[n - 1] = cells;
  });
  return Array.from(rows, (r) => r ?? []);
}

/** Exporta un quiz propio (el borrador actual del editor). */
export async function exportQuiz(userId: string, quizId: string, format: TableFormat) {
  const { doc } = await getQuizForEditor(quizId, userId);
  const lang = doc.language === 'en' ? 'en' : 'es';
  const rows = quizToTable(doc.questions, lang);
  const name =
    (doc.title || 'quiz')
      .replace(/[^\p{L}\p{N} _-]/gu, '')
      .trim()
      .slice(0, 60) || 'quiz';
  if (format === 'csv')
    return {
      name: `${name}.csv`,
      body: Buffer.from(toCsv(rows), 'utf8'),
      type: 'text/csv; charset=utf-8',
    };
  return {
    name: `${name}.xlsx`,
    body: await toXlsx(rows, name),
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

/** Plantilla con ejemplos de cada tipo que se puede importar. */
export async function importTemplate(format: TableFormat, lang: 'es' | 'en') {
  const es = lang === 'es';
  const mc = createQuestion('MULTIPLE_CHOICE', lang);
  mc.prompt = es ? '¿Cuál es el planeta más grande?' : 'Which is the largest planet?';
  mc.options = ['Júpiter', 'Saturno', 'Tierra', 'Marte'].map((t, i) => createOption(t, i === 0));
  mc.explanation = es
    ? 'Júpiter es el más grande del sistema solar.'
    : 'Jupiter is the largest in the solar system.';
  const tf = createQuestion('TRUE_FALSE', lang);
  tf.prompt = es
    ? 'El agua hierve a 100 °C al nivel del mar'
    : 'Water boils at 100 °C at sea level';
  const ta = createQuestion('TYPE_ANSWER', lang);
  ta.prompt = es ? 'Capital de Francia' : 'Capital of France';
  ta.config = { accepted: es ? ['París', 'Paris'] : ['Paris'] };
  const order = createQuestion('ORDER', lang);
  order.prompt = es ? 'Ordena de menor a mayor' : 'Order from smallest to largest';
  order.options = ['1', '10', '100'].map((t) => createOption(t));
  const match = createQuestion('MATCH', lang);
  match.prompt = es ? 'Empareja país y capital' : 'Match country and capital';
  match.config = {
    pairs: [
      { id: newId(), left: 'Perú', right: 'Lima' },
      { id: newId(), left: 'Chile', right: 'Santiago' },
    ],
  };
  const slider = createQuestion('SLIDER', lang);
  slider.prompt = es ? '¿Cuántos días tiene un año bisiesto?' : 'How many days are in a leap year?';
  slider.config = { slider: { min: 300, max: 400, step: 1, correct: 366, tolerance: 0 } };
  const fill = createQuestion('FILL_BLANK', lang);
  fill.prompt = es ? 'El ___ es el océano más grande' : 'The ___ is the largest ocean';
  fill.config = { blanks: [es ? ['Pacífico', 'Pacifico'] : ['Pacific']] };
  const poll = createQuestion('POLL', lang);
  poll.prompt = es ? '¿Qué estación prefieres?' : 'Which season do you prefer?';
  poll.options = (es ? ['Verano', 'Invierno'] : ['Summer', 'Winter']).map((t) => createOption(t));
  const rows = quizToTable([mc, tf, ta, order, match, slider, fill, poll], lang);
  const name = es ? 'plantilla-quiz-rush' : 'quiz-rush-template';
  if (format === 'csv')
    return {
      name: `${name}.csv`,
      body: Buffer.from(toCsv(rows), 'utf8'),
      type: 'text/csv; charset=utf-8',
    };
  return {
    name: `${name}.xlsx`,
    body: await toXlsx(rows, 'Quiz'),
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

/** Importa un archivo CSV/Excel como quiz nuevo (borrador). */
export async function importQuiz(
  userId: string,
  file: { name: string; type: string; data: Buffer },
  lang: 'es' | 'en',
): Promise<{ id: string; imported: number; errors: ImportResult['errors'] }> {
  if (file.data.byteLength > MAX_IMPORT_BYTES) throw new ApiError(413, 'IMPORT_TOO_LARGE');
  const isXlsx = /\.xlsx$/i.test(file.name) || file.type.includes('spreadsheetml');
  const isCsv = /\.(csv|txt|tsv)$/i.test(file.name) || file.type.startsWith('text/');
  if (!isXlsx && !isCsv) throw new ApiError(400, 'IMPORT_UNSUPPORTED');
  // Excel guarda los .xlsx como ZIP: se comprueba la firma para no procesar cualquier cosa
  if (isXlsx && file.data.subarray(0, 2).toString('latin1') !== 'PK')
    throw new ApiError(400, 'IMPORT_INVALID_FILE');
  const rows = isXlsx ? await readXlsx(file.data) : parseCsv(file.data.toString('utf8'));
  const { questions, errors } = tableToQuestions(rows, lang);
  if (!questions.length) throw new ApiError(422, 'IMPORT_EMPTY', { errors });
  const title = file.name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .slice(0, 120);
  const doc = { ...createEmptyQuiz(lang), title, questions: questions as QuestionDoc[] };
  const id = await createQuiz(userId, lang, doc, 'IMPORT');
  return { id, imported: questions.length, errors };
}

/** Cualquier tabla (informes) como archivo CSV o Excel para descargar. */
export async function tableFile(rows: string[][], format: TableFormat, name: string) {
  const safe =
    name
      .replace(/[^\p{L}\p{N} _-]/gu, '')
      .trim()
      .slice(0, 60) || 'informe';
  if (format === 'csv')
    return {
      name: `${safe}.csv`,
      body: Buffer.from(toCsv(rows), 'utf8'),
      type: 'text/csv; charset=utf-8',
    };
  return {
    name: `${safe}.xlsx`,
    body: await toXlsx(rows, safe),
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

/** Respuesta HTTP de descarga de un archivo. */
export function downloadResponse(file: { name: string; body: Buffer; type: string }) {
  return new Response(new Uint8Array(file.body), {
    headers: {
      'content-type': file.type,
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'cache-control': 'private, no-store',
    },
  });
}
