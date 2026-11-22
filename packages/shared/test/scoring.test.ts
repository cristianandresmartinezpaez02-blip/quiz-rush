import { describe, expect, it } from 'vitest';
import {
  computeAnswerPoints,
  computeStreakBonus,
  multiSelectCorrectness,
  nextStreak,
  orderCorrectness,
  sliderCorrectness,
} from '../src';

describe('computeAnswerPoints (modo clásico)', () => {
  const base = { correctness: 1, timeLimitMs: 20_000, pointsMode: 'NORMAL' as const };

  it('da el 100 % de la base al responder instantáneamente', () => {
    expect(computeAnswerPoints({ ...base, elapsedMs: 0 })).toBe(1000);
  });

  it('da el 50 % de la base al responder en el último instante', () => {
    expect(computeAnswerPoints({ ...base, elapsedMs: 20_000 })).toBe(500);
  });

  it('escala linealmente con el tiempo', () => {
    expect(computeAnswerPoints({ ...base, elapsedMs: 10_000 })).toBe(750);
  });

  it('duplica con puntos dobles y anula con "sin puntos"', () => {
    expect(computeAnswerPoints({ ...base, elapsedMs: 0, pointsMode: 'DOUBLE' })).toBe(2000);
    expect(computeAnswerPoints({ ...base, elapsedMs: 0, pointsMode: 'NONE' })).toBe(0);
  });

  it('no puntúa respuestas incorrectas ni fuera de tiempo', () => {
    expect(computeAnswerPoints({ ...base, elapsedMs: 100, correctness: 0 })).toBe(0);
    expect(computeAnswerPoints({ ...base, elapsedMs: 20_001 })).toBe(0);
  });

  it('en modo sin velocidad solo importa acertar', () => {
    expect(computeAnswerPoints({ ...base, elapsedMs: 19_000, speedEnabled: false })).toBe(1000);
  });

  it('aplica crédito parcial', () => {
    expect(computeAnswerPoints({ ...base, elapsedMs: 0, correctness: 0.5 })).toBe(500);
  });

  it('acota valores fuera de rango', () => {
    expect(computeAnswerPoints({ ...base, elapsedMs: -50, correctness: 3 })).toBe(1000);
  });
});

describe('rachas', () => {
  it('el bono empieza en el segundo acierto y tiene tope', () => {
    expect(computeStreakBonus(1)).toBe(0);
    expect(computeStreakBonus(2)).toBe(100);
    expect(computeStreakBonus(4)).toBe(300);
    expect(computeStreakBonus(50)).toBe(500);
  });

  it('el escudo conserva la racha al fallar', () => {
    expect(nextStreak({ streak: 3 }, true)).toEqual({ streak: 4, shieldUsed: false });
    expect(nextStreak({ streak: 3 }, false)).toEqual({ streak: 0, shieldUsed: false });
    expect(nextStreak({ streak: 3, shield: true }, false)).toEqual({ streak: 3, shieldUsed: true });
  });
});

describe('crédito parcial por tipo', () => {
  it('deslizador: exacto, dentro y fuera de la tolerancia', () => {
    expect(sliderCorrectness(50, 50, 10)).toBe(1);
    expect(sliderCorrectness(55, 50, 10)).toBe(0.5);
    expect(sliderCorrectness(61, 50, 10)).toBe(0);
  });

  it('varias correctas: penaliza las selecciones erróneas', () => {
    expect(multiSelectCorrectness(['a', 'b'], ['a', 'b'])).toBe(1);
    expect(multiSelectCorrectness(['a'], ['a', 'b'])).toBe(0.5);
    expect(multiSelectCorrectness(['a', 'c'], ['a', 'b'])).toBe(0);
    expect(multiSelectCorrectness(['a', 'b', 'c', 'd'], ['a', 'b'])).toBe(0);
  });

  it('ordenar: fracción de posiciones correctas', () => {
    expect(orderCorrectness(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
    expect(orderCorrectness(['a', 'c', 'b'], ['a', 'b', 'c'])).toBeCloseTo(1 / 3);
  });
});
