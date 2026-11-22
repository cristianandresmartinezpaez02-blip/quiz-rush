import { describe, expect, it } from 'vitest';
import {
  answerBasePoints,
  computeHighlights,
  finalMessageKey,
  generatePin,
  gradeAnswer,
  joinPayloadSchema,
  nicknameSchema,
  resultMessageKey,
  toPublicQuestion,
  type GameQuestion,
} from '../src';

const mc: GameQuestion = {
  id: 'q1',
  type: 'MULTIPLE_CHOICE',
  prompt: '¿Planeta más grande?',
  timeLimit: 20,
  points: 'NORMAL',
  media: null,
  hint: null,
  explanation: 'Júpiter',
  options: [
    { id: 'a', text: 'Júpiter', isCorrect: true },
    { id: 'b', text: 'Marte', isCorrect: false },
  ],
  config: {},
};

describe('corrección de respuestas', () => {
  it('opción única correcta e incorrecta', () => {
    expect(gradeAnswer(mc, { qIndex: 0, optionIds: ['a'] }).correctness).toBe(1);
    expect(gradeAnswer(mc, { qIndex: 0, optionIds: ['b'] }).correctness).toBe(0);
  });

  it('rechaza ids inventados y varias opciones en pregunta de una sola', () => {
    expect(gradeAnswer(mc, { qIndex: 0, optionIds: ['zzz'] }).valid).toBe(false);
    expect(gradeAnswer(mc, { qIndex: 0, optionIds: ['a', 'b'] }).valid).toBe(false);
    expect(gradeAnswer(mc, { qIndex: 0 }).valid).toBe(false);
  });

  it('varias correctas con crédito parcial', () => {
    const multi: GameQuestion = {
      ...mc,
      config: { multiSelect: true },
      options: [
        { id: 'a', text: 'A', isCorrect: true },
        { id: 'b', text: 'B', isCorrect: true },
        { id: 'c', text: 'C', isCorrect: false },
      ],
    };
    expect(gradeAnswer(multi, { qIndex: 0, optionIds: ['a', 'b'] }).correctness).toBe(1);
    expect(gradeAnswer(multi, { qIndex: 0, optionIds: ['a'] }).correctness).toBe(0.5);
    expect(gradeAnswer(multi, { qIndex: 0, optionIds: ['a', 'a'] }).correctness).toBe(0.5); // sin duplicados
  });

  it('respuesta escrita ignora mayúsculas y tildes', () => {
    const typed: GameQuestion = {
      ...mc,
      type: 'TYPE_ANSWER',
      options: [],
      config: { accepted: ['Bogotá'] },
    };
    const r = gradeAnswer(typed, { qIndex: 0, text: '  BOGOTA ' });
    expect(r.correctness).toBe(1);
    expect(r.distributionKeys).toEqual(['bogota']);
    expect(gradeAnswer(typed, { qIndex: 0, text: '' }).valid).toBe(false);
  });

  it('las encuestas no puntúan', () => {
    const poll: GameQuestion = { ...mc, type: 'POLL', points: 'NONE' };
    expect(gradeAnswer(poll, { qIndex: 0, optionIds: ['b'] }).valid).toBe(true);
    expect(answerBasePoints(poll, 1, 0, 20_000, true)).toBe(0);
  });

  it('puntos según velocidad y modo sin velocidad', () => {
    expect(answerBasePoints(mc, 1, 0, 20_000, true)).toBe(1000);
    expect(answerBasePoints(mc, 1, 10_000, 20_000, true)).toBe(750);
    expect(answerBasePoints(mc, 1, 19_000, 20_000, false)).toBe(1000);
  });

  it('la versión pública no filtra la respuesta correcta', () => {
    const pub = toPublicQuestion(mc, 0, 5);
    expect(JSON.stringify(pub)).not.toContain('isCorrect');
    expect(JSON.stringify(pub)).not.toContain('explanation');
  });
});

describe('mensajes y momentos destacados', () => {
  const base = {
    scored: true,
    answered: true,
    correctness: 1,
    streak: 1,
    previousStreak: 0,
    elapsedMs: 9000,
    timeLimitMs: 20_000,
    rank: 5,
    prevRank: 5,
  };

  it('elige el mensaje según el resultado', () => {
    expect(resultMessageKey({ ...base, streak: 5 })).toBe('unstoppable');
    expect(resultMessageKey({ ...base, streak: 3 })).toBe('onFire');
    expect(resultMessageKey({ ...base, elapsedMs: 1000 })).toBe('lightning');
    expect(resultMessageKey({ ...base, prevRank: 9, rank: 2 })).toBe('comeback');
    expect(resultMessageKey({ ...base, correctness: 0, previousStreak: 4 })).toBe('streakLost');
    expect(resultMessageKey({ ...base, answered: false, correctness: 0 })).toBe('noAnswer');
    expect(resultMessageKey({ ...base, scored: false })).toBe('poll');
    expect(finalMessageKey(1, 30)).toBe('unstoppable');
  });

  it('calcula los momentos destacados', () => {
    const h = computeHighlights(
      [
        {
          qIndex: 0,
          prompt: 'Fácil',
          scored: true,
          answered: 4,
          correctCount: 4,
          fastest: { nick: 'Sofi', avatar: '🦊', ms: 900 },
        },
        {
          qIndex: 1,
          prompt: 'Difícil',
          scored: true,
          answered: 4,
          correctCount: 1,
          fastest: { nick: 'Leo', avatar: '🐼', ms: 3000 },
        },
      ],
      [
        { nick: 'Sofi', avatar: '🦊', bestStreak: 2, bestClimb: 0, correct: 2 },
        { nick: 'Leo', avatar: '🐼', bestStreak: 1, bestClimb: 3, correct: 1 },
      ],
    );
    const kinds = Object.fromEntries(h.map((x) => [x.kind, x]));
    expect(kinds.fastest?.nick).toBe('Sofi');
    expect(kinds.hardest?.prompt).toBe('Difícil');
    expect(kinds.easiest?.value).toBe(100);
    expect(kinds.comeback?.nick).toBe('Leo');
    expect(kinds.perfect?.nick).toBe('Sofi');
  });
});

describe('entrada a la partida', () => {
  it('PIN de 6 dígitos', () => {
    for (let i = 0; i < 50; i++) expect(generatePin()).toMatch(/^[1-9]\d{5}$/);
  });

  it('valida apodos (longitud, caracteres y groserías)', () => {
    expect(nicknameSchema.safeParse('Sofi_99').success).toBe(true);
    expect(nicknameSchema.safeParse('a').success).toBe(false);
    expect(nicknameSchema.safeParse('<script>').success).toBe(false);
    expect(nicknameSchema.safeParse('nazi_power').success).toBe(false);
  });

  it('solo acepta avatares de la lista', () => {
    expect(
      joinPayloadSchema.safeParse({ pin: '123456', nickname: 'Leo', avatar: '🐼' }).success,
    ).toBe(true);
    expect(
      joinPayloadSchema.safeParse({ pin: '123456', nickname: 'Leo', avatar: 'XSS' }).success,
    ).toBe(false);
    expect(
      joinPayloadSchema.safeParse({ pin: '12345', nickname: 'Leo', avatar: '🐼' }).success,
    ).toBe(false);
  });
});
