// IA: protección SSRF, extracción de texto de HTML y modo simulado (que debe producir preguntas
// válidas para el editor, igual que la IA real).
import { describe, expect, it, vi } from 'vitest';
import { aiGenerateOptionsSchema, aiQuizToQuestions, aiQuizSchema } from '@quiz-rush/shared';

vi.mock('server-only', () => ({}));

const { isPrivateAddress, htmlToText } = await import('../lib/ai/fetch-url');
const { mockQuiz, mockModeration, mockDistractors } = await import('../lib/ai/mock');

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.10',
    '169.254.169.254',
    '0.0.0.0',
    '100.64.0.1',
    '::1',
    '::',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
  ])('bloquea %s', (ip) => expect(isPrivateAddress(ip)).toBe(true));

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111'])('permite %s', (ip) =>
    expect(isPrivateAddress(ip)).toBe(false),
  );
});

describe('htmlToText', () => {
  it('quita scripts, estilos y etiquetas y decodifica entidades', () => {
    const { title, text } = htmlToText(
      '<html><head><title>La célula</title><style>p{color:red}</style><script>alert(1)</script></head>' +
        '<body><nav>menú</nav><h1>Partes</h1><p>Núcleo &amp; membrana</p></body></html>',
    );
    expect(title).toBe('La célula');
    expect(text).toContain('Partes');
    expect(text).toContain('Núcleo & membrana');
    expect(text).not.toContain('alert');
    expect(text).not.toContain('color:red');
  });
});

describe('modo simulado', () => {
  it('genera un quiz que cumple el esquema y se convierte sin descartes', () => {
    const options = aiGenerateOptionsSchema.parse({
      source: 'topic',
      input: 'Los planetas',
      count: 6,
      types: [
        'MULTIPLE_CHOICE',
        'TRUE_FALSE',
        'TYPE_ANSWER',
        'ORDER',
        'MATCH',
        'SLIDER',
        'FILL_BLANK',
      ],
      language: 'es',
    });
    const quiz = aiQuizSchema.parse(mockQuiz(options));
    expect(quiz.questions).toHaveLength(6);
    const { questions, discarded } = aiQuizToQuestions(quiz, 'es');
    expect(discarded).toBe(0);
    expect(questions).toHaveLength(6);
  });

  it('modera con el filtro de palabrotas y sugiere distractores', () => {
    expect(mockModeration('Quiz de matemáticas').verdict).toBe('ok');
    expect(mockDistractors('París', 3)).toHaveLength(3);
  });
});
