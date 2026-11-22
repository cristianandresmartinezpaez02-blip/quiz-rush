// Fase 6: importar/exportar tablas, conversión de la salida de la IA, plantillas y clases.
import { describe, expect, it } from 'vitest';
import {
  aiQuizToQuestions,
  attemptPercent,
  certificateCode,
  classCodeSchema,
  createQuestion,
  generateClassCode,
  neutralizeFormula,
  parseCsv,
  quizToTable,
  tableToQuestions,
  TEMPLATE_IDS,
  templateDoc,
  toCsv,
  validateQuestion,
  type AiQuiz,
  type QuestionDoc,
} from '../src';

function mc(): QuestionDoc {
  const q = createQuestion('MULTIPLE_CHOICE', 'es');
  q.prompt = '¿2 + 2?';
  q.options = q.options.map((o, i) => ({ ...o, text: String(i + 3), isCorrect: i === 1 }));
  q.explanation = 'Suma básica';
  return q;
}

describe('importar y exportar como tabla', () => {
  it('ida y vuelta conserva los tipos que caben en una tabla', () => {
    const ta = createQuestion('TYPE_ANSWER', 'es');
    ta.prompt = 'Capital de Colombia';
    ta.config = { accepted: ['Bogotá', 'Bogota'] };
    const order = createQuestion('ORDER', 'es');
    order.prompt = 'Ordena';
    order.options = order.options.map((o, i) => ({ ...o, text: ['uno', 'dos', 'tres'][i]! }));
    const slider = createQuestion('SLIDER', 'es');
    slider.prompt = 'Temperatura';
    slider.config = {
      slider: { min: -10, max: 40, step: 1, correct: 22, tolerance: 3, unit: '°C' },
    };
    const match = createQuestion('MATCH', 'es');
    match.prompt = 'Empareja';
    match.config = {
      pairs: [
        { id: 'a', left: 'Perro', right: 'Guau' },
        { id: 'b', left: 'Gato', right: 'Miau' },
      ],
    };
    const fill = createQuestion('FILL_BLANK', 'es');
    fill.prompt = 'El ___ es rojo y el ___ azul';
    fill.config = { blanks: [['tomate', 'jitomate'], ['cielo']] };
    const source = [mc(), ta, order, slider, match, fill];

    const csv = toCsv(quizToTable(source, 'es'));
    expect(csv.startsWith('﻿')).toBe(true);
    const { questions, errors } = tableToQuestions(parseCsv(csv), 'es');
    expect(errors).toEqual([]);
    expect(questions.map((q) => q.type)).toEqual(source.map((q) => q.type));
    expect(questions[0]!.options.filter((o) => o.isCorrect).map((o) => o.text)).toEqual(['4']);
    expect(questions[0]!.explanation).toBe('Suma básica');
    expect(questions[1]!.config.accepted).toEqual(['Bogotá', 'Bogota']);
    expect(questions[2]!.options.map((o) => o.text)).toEqual(['uno', 'dos', 'tres']);
    expect(questions[3]!.config.slider).toEqual({
      min: -10,
      max: 40,
      step: 1,
      correct: 22,
      tolerance: 3,
      unit: '°C',
    });
    expect(questions[4]!.config.pairs?.map((p) => `${p.left}-${p.right}`)).toEqual([
      'Perro-Guau',
      'Gato-Miau',
    ]);
    expect(questions[5]!.config.blanks).toEqual([['tomate', 'jitomate'], ['cielo']]);
    for (const q of questions) expect(validateQuestion(q)).toEqual([]);
  });

  it('acepta encabezados en inglés, tipos por nombre y separador ;', () => {
    const csv =
      'Type;Question;Option 1;Option 2;Option 3;Correct\r\nV/F;El sol es una estrella;;;;1\r\nmultiple choice;"¿Color; del cielo?";Rojo;Azul;Verde;2\r\n';
    const { questions, errors } = tableToQuestions(parseCsv(csv), 'es');
    expect(errors).toEqual([]);
    expect(questions[0]!.type).toBe('TRUE_FALSE');
    expect(questions[0]!.options.map((o) => o.isCorrect)).toEqual([true, false]);
    expect(questions[1]!.prompt).toBe('¿Color; del cielo?');
    expect(questions[1]!.options[1]).toMatchObject({ text: 'Azul', isCorrect: true });
  });

  it('informa las filas que no se pueden importar sin perder las demás', () => {
    const rows = [
      ['Tipo', 'Pregunta', 'Opción 1', 'Opción 2', 'Correctas'],
      ['Desconocido', 'x', 'a', 'b', '1'],
      ['Opción múltiple', '', 'a', 'b', '1'],
      ['Opción múltiple', 'Sin correcta', 'a', 'b', ''],
      ['Opción múltiple', 'Correcta fuera de rango', 'a', 'b', '5'],
      ['Pin en imagen', 'Toca aquí', '', '', ''],
      ['Opción múltiple', 'Buena', 'a', 'b', '2'],
    ];
    const { questions, errors } = tableToQuestions(rows, 'es');
    expect(questions).toHaveLength(1);
    expect(errors).toEqual([
      { row: 2, code: 'UNKNOWN_TYPE' },
      { row: 3, code: 'EMPTY_PROMPT' },
      { row: 4, code: 'BAD_CORRECT' },
      { row: 5, code: 'BAD_CORRECT' },
      { row: 6, code: 'PIN_NOT_SUPPORTED' },
    ]);
  });

  it('CSV: comillas, saltos de línea en celdas y fórmulas neutralizadas', () => {
    const rows = [['a "b"', 'línea 1\nlínea 2', '=HYPERLINK("x")', '-10', '-cmd']];
    const back = parseCsv(toCsv(rows));
    expect(back[0]).toEqual(['a "b"', 'línea 1\nlínea 2', `'=HYPERLINK("x")`, '-10', "'-cmd"]);
    expect(neutralizeFormula('+1')).toBe("'+1");
    expect(neutralizeFormula('@SUM')).toBe("'@SUM");
    expect(neutralizeFormula('-3.5')).toBe('-3.5');
  });
});

describe('salida del generador con IA', () => {
  const base = {
    acceptedAnswers: [],
    blanks: [],
    pairs: [],
    slider: null,
    explanation: 'Porque sí',
    hint: 'Piensa',
    timeLimit: 20,
  };
  it('convierte y descarta lo que no pasa la validación', () => {
    const ai: AiQuiz = {
      title: 'Planetas',
      description: 'Del sistema solar',
      category: 'science',
      questions: [
        {
          ...base,
          type: 'MULTIPLE_CHOICE',
          prompt: '¿Planeta rojo?',
          options: [
            { text: 'Marte', correct: true },
            { text: 'Venus', correct: false },
            { text: 'Júpiter', correct: false },
          ],
        },
        {
          ...base,
          type: 'TRUE_FALSE',
          prompt: 'Plutón es un planeta enano',
          options: [
            { text: 'Verdadero', correct: true },
            { text: 'Falso', correct: false },
          ],
        },
        {
          ...base,
          type: 'TRUE_FALSE',
          prompt: 'El Sol es un planeta',
          options: [{ text: 'Falso', correct: true }],
        },
        {
          ...base,
          type: 'MULTIPLE_CHOICE',
          prompt: 'Sin correcta',
          options: [
            { text: 'a', correct: false },
            { text: 'b', correct: false },
          ],
        },
        {
          ...base,
          type: 'SLIDER',
          prompt: 'Planetas del sistema solar',
          options: [],
          slider: { min: 1, max: 12, step: 1, correct: 8, tolerance: 0, unit: '' },
        },
        { ...base, type: 'SLIDER', prompt: 'Sin rango', options: [], slider: null },
        {
          ...base,
          type: 'FILL_BLANK',
          prompt: 'La Tierra gira alrededor del ___',
          options: [],
          blanks: [['Sol', 'sol']],
        },
      ],
    };
    const { questions, discarded } = aiQuizToQuestions(ai, 'es');
    expect(discarded).toBe(2);
    expect(questions.map((q) => q.type)).toEqual([
      'MULTIPLE_CHOICE',
      'TRUE_FALSE',
      'TRUE_FALSE',
      'SLIDER',
      'FILL_BLANK',
    ]);
    // V/F: la correcta se deduce del texto de la opción marcada
    expect(questions[1]!.options[0]!.isCorrect).toBe(true);
    expect(questions[2]!.options[1]!.isCorrect).toBe(true);
    expect(questions[0]!.explanation).toBe('Porque sí');
  });
});

describe('plantillas', () => {
  it('cada plantilla crea un borrador con preguntas en ambos idiomas', () => {
    for (const id of TEMPLATE_IDS) {
      for (const lang of ['es', 'en'] as const) {
        const doc = templateDoc(id, lang);
        expect(doc.questions.length).toBeGreaterThanOrEqual(3);
        expect(doc.title.length).toBeGreaterThan(3);
        expect(new Set(doc.questions.map((q) => q.id)).size).toBe(doc.questions.length);
      }
    }
  });
});

describe('clases y certificados', () => {
  it('códigos de clase legibles y validados', () => {
    const code = generateClassCode();
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(classCodeSchema.parse(` ${code.toLowerCase()} `)).toBe(code);
    expect(classCodeSchema.safeParse('ABC0O1').success).toBe(false);
  });

  it('porcentaje y código de certificado estable', () => {
    expect(attemptPercent(7, 10)).toBe(70);
    expect(attemptPercent(0, 0)).toBe(0);
    expect(certificateCode('abc')).toBe(certificateCode('abc'));
    expect(certificateCode('abc')).toMatch(/^QR-[0-9A-Z]{4}-[0-9A-Z]{3}$/);
    expect(certificateCode('abc')).not.toBe(certificateCode('abd'));
  });
});
