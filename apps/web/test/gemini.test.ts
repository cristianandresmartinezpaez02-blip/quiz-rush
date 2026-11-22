// Adaptador de Gemini: misma forma que la respuesta de Claude, validación con Zod y errores.
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('server-only', () => ({}));
const { geminiParse } = await import('../lib/ai/gemini');

const schema = z.object({ title: z.string(), n: z.number() });
const format = {
  schema: z.toJSONSchema(schema) as Record<string, unknown>,
  parse: (t: string) => schema.parse(JSON.parse(t)),
};
const params = {
  model: 'x',
  max_tokens: 500,
  system: 'Eres un ayudante.',
  output_config: { format },
  messages: [{ role: 'user' as const, content: 'Hola' }],
} as unknown as Parameters<typeof geminiParse>[0];

function reply(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

describe('geminiParse', () => {
  it('devuelve el JSON validado con la forma de Claude', async () => {
    reply({
      candidates: [
        {
          content: { parts: [{ text: '```json\n{"title":"Hola","n":3}\n```' }] },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    });
    const r = await geminiParse(params);
    expect(r).toMatchObject({ stop_reason: 'end_turn', parsed_output: { title: 'Hola', n: 3 } });
    expect(r.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
  });

  it('un JSON que no cumple el esquema no pasa', async () => {
    reply({
      candidates: [{ content: { parts: [{ text: '{"title":1}' }] }, finishReason: 'STOP' }],
    });
    expect((await geminiParse(params)).parsed_output).toBeNull();
  });

  it('contenido bloqueado por seguridad = rechazo', async () => {
    reply({ candidates: [{ finishReason: 'SAFETY' }] });
    expect((await geminiParse(params)).stop_reason).toBe('refusal');
  });

  it('cupo gratuito agotado (429) = AI_BUSY', async () => {
    reply({ error: 'quota' }, 429);
    await expect(geminiParse(params)).rejects.toMatchObject({ code: 'AI_BUSY' });
  });

  it('si un modelo está saturado, prueba el siguiente', async () => {
    const ok = {
      candidates: [{ content: { parts: [{ text: '{"title":"B","n":1}' }] }, finishReason: 'STOP' }],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(ok), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await geminiParse(params);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.parsed_output).toEqual({ title: 'B', n: 1 });
  });
});
