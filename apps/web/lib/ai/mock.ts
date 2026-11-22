// Modo simulado de la IA (AI_MOCK=1): respuestas fijas y deterministas, sin llamadas al API.
// Solo para pruebas automáticas y demos sin clave; el título lo deja claro.
import 'server-only';
import type { AiGenerateOptions, AiModeration, AiQuiz, AiQuestion } from '@quiz-rush/shared';
import { containsProfanity } from '@quiz-rush/shared';

export function mockQuiz(o: AiGenerateOptions): AiQuiz {
  const topic = (o.source === 'topic' ? o.input : 'el material').trim().slice(0, 60) || 'general';
  const es = o.language !== 'en';
  const base: Pick<AiQuestion, 'acceptedAnswers' | 'blanks' | 'pairs' | 'slider' | 'timeLimit'> = {
    acceptedAnswers: [],
    blanks: [],
    pairs: [],
    slider: null,
    timeLimit: 20,
  };
  const make = (i: number): AiQuestion => {
    const type = o.types[i % o.types.length]!;
    const n = i + 1;
    const explanation = es ? `Explicación simulada ${n}.` : `Mock explanation ${n}.`;
    const hint = es ? 'Pista simulada' : 'Mock hint';
    switch (type) {
      case 'TRUE_FALSE':
        return {
          ...base,
          type,
          prompt: `${es ? 'Afirmación' : 'Statement'} ${n} (${topic})`,
          options: [
            { text: es ? 'Verdadero' : 'True', correct: true },
            { text: es ? 'Falso' : 'False', correct: false },
          ],
          explanation,
          hint,
        };
      case 'TYPE_ANSWER':
        return {
          ...base,
          type,
          prompt: `${es ? 'Escribe' : 'Type'} "rush" (${n})`,
          options: [],
          acceptedAnswers: ['rush'],
          explanation,
          hint,
        };
      case 'ORDER':
        return {
          ...base,
          type,
          prompt: `${es ? 'Ordena' : 'Order'} ${n}`,
          options: ['1', '2', '3'].map((t) => ({ text: t, correct: false })),
          explanation,
          hint,
        };
      case 'MATCH':
        return {
          ...base,
          type,
          prompt: `${es ? 'Empareja' : 'Match'} ${n}`,
          options: [],
          pairs: [
            { left: 'A', right: 'a' },
            { left: 'B', right: 'b' },
            { left: 'C', right: 'c' },
          ],
          explanation,
          hint,
        };
      case 'SLIDER':
        return {
          ...base,
          type,
          prompt: `${es ? 'Elige' : 'Pick'} 50 (${n})`,
          options: [],
          slider: { min: 0, max: 100, step: 1, correct: 50, tolerance: 5, unit: '' },
          explanation,
          hint,
        };
      case 'FILL_BLANK':
        return {
          ...base,
          type,
          prompt: `Quiz___ (${n})`,
          options: [],
          blanks: [['Rush']],
          explanation,
          hint,
        };
      default:
        return {
          ...base,
          type,
          prompt: `${es ? 'Pregunta' : 'Question'} ${n} ${es ? 'sobre' : 'about'} ${topic}`,
          options: ['A', 'B', 'C', 'D'].map((t, k) => ({
            text: `${es ? 'Opción' : 'Option'} ${t}`,
            correct: k === i % 4,
          })),
          explanation,
          hint,
        };
    }
  };
  return {
    title: `${es ? 'Quiz simulado' : 'Mock quiz'}: ${topic}`,
    description: es
      ? 'Generado en modo simulado (sin IA real).'
      : 'Generated in mock mode (no real AI).',
    category: 'general',
    questions: Array.from({ length: o.count }, (_, i) => make(i)),
  };
}

export function mockDistractors(correct: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${correct} (${i + 1})`);
}

export function mockModeration(text: string): AiModeration {
  return containsProfanity(text)
    ? { verdict: 'block', reasons: ['harassment'], note: 'mock: lenguaje ofensivo' }
    : { verdict: 'ok', reasons: [], note: 'mock' };
}
