// Proveedor alternativo de IA: Google Gemini (tiene un plan gratuito, sin tarjeta).
// Se usa cuando hay GEMINI_API_KEY y no hay ANTHROPIC_API_KEY.
//
// Devuelve la respuesta con la MISMA forma que `anthropic().beta.messages.parse()` (model,
// usage, stop_reason, parsed_output), así generate/assist/moderate no cambian. El resultado se
// valida con el mismo esquema Zod: una respuesta mal formada nunca llega al editor.
import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { ApiError } from '../api';

/**
 * Modelos en orden de preferencia (GEMINI_MODEL="a,b,c" para cambiarlos). Si uno está saturado
 * (503), agotó su cupo gratuito (429; el cupo es por modelo) o ya no existe (404), se prueba el
 * siguiente.
 */
export const GEMINI_MODELS = (
  process.env.GEMINI_MODEL || 'gemini-flash-latest,gemini-3.5-flash,gemini-flash-lite-latest'
)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
export const GEMINI_MODEL = GEMINI_MODELS[0]!;
const RETRY_NEXT = new Set([404, 429, 500, 503]);
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

type ParseParams = Parameters<Anthropic['beta']['messages']['parse']>[0];
type Block = Anthropic.Beta.BetaContentBlockParam;

interface Format {
  schema: Record<string, unknown>;
  parse: (content: string) => unknown;
}

export interface ParsedLike {
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  stop_reason: 'end_turn' | 'max_tokens' | 'refusal';
  parsed_output: unknown;
}

/** Bloques de contenido (texto, imagen, PDF en base64) → partes de Gemini. */
type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

function toParts(content: string | Block[]): Part[] {
  if (typeof content === 'string') return [{ text: content }];
  return content.flatMap((b): Part[] => {
    if (b.type === 'text') return [{ text: b.text }];
    if ((b.type === 'image' || b.type === 'document') && b.source.type === 'base64') {
      return [{ inline_data: { mime_type: b.source.media_type, data: b.source.data } }];
    }
    return [];
  });
}

function systemText(system: ParseParams['system']): string {
  if (!system) return '';
  if (typeof system === 'string') return system;
  return system.map((b) => ('text' in b ? b.text : '')).join('\n');
}

export async function geminiParse(params: ParseParams): Promise<ParsedLike> {
  const format = (params.output_config as { format?: Format } | undefined)?.format;
  if (!format) throw new ApiError(500, 'AI_FAILED');
  const user = params.messages[0];
  const content = (user?.content ?? '') as string | Block[];

  // El esquema va en las instrucciones y además se pide JSON: es lo más compatible con todos
  // los modelos de Gemini. Después se valida con Zod.
  const system = `${systemText(params.system)}

Responde ÚNICAMENTE con un objeto JSON válido (sin texto alrededor ni bloques de código) que cumpla este JSON Schema:
${JSON.stringify(format.schema)}`;

  const body = JSON.stringify({
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: toParts(content) }],
    generationConfig: {
      responseMimeType: 'application/json',
      maxOutputTokens: params.max_tokens,
      temperature: 0.7,
    },
  });

  let res: Response | null = null;
  let usedModel = GEMINI_MODEL;
  for (const candidateModel of GEMINI_MODELS) {
    usedModel = candidateModel;
    try {
      res = await fetch(`${ENDPOINT}/${candidateModel}:generateContent`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY ?? '',
        },
        body,
        signal: AbortSignal.timeout(180_000),
      });
    } catch (err) {
      console.error(`[ia] Gemini (${candidateModel}) no responde:`, (err as Error).message);
      res = null;
      continue;
    }
    if (res.ok || !RETRY_NEXT.has(res.status)) break;
    console.warn(
      `[ia] Gemini ${candidateModel} respondió ${res.status}: pruebo el siguiente modelo`,
    );
  }
  if (!res) throw new ApiError(503, 'AI_UNAVAILABLE');

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    if (res.status === 401 || res.status === 403) {
      console.error('[ia] clave de Gemini no válida:', detail);
      throw new ApiError(503, 'AI_MISCONFIGURED');
    }
    // 429 en todos los modelos: se agotó el cupo gratuito (por minuto o por día)
    if (res.status === 429) throw new ApiError(503, 'AI_BUSY');
    if (res.status === 400) {
      console.error('[ia] Gemini rechazó la petición:', detail);
      throw new ApiError(422, 'AI_BAD_INPUT');
    }
    console.error(`[ia] Gemini error ${res.status}:`, detail);
    throw new ApiError(503, 'AI_UNAVAILABLE');
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    modelVersion?: string;
  };
  const candidate = data.candidates?.[0];
  const finish = candidate?.finishReason ?? '';
  const usage = {
    input_tokens: data.usageMetadata?.promptTokenCount ?? 0,
    output_tokens: data.usageMetadata?.candidatesTokenCount ?? 0,
  };
  const model = data.modelVersion ?? usedModel;

  if (
    data.promptFeedback?.blockReason ||
    ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'].includes(finish)
  ) {
    return { model, usage, stop_reason: 'refusal', parsed_output: null };
  }
  if (finish === 'MAX_TOKENS')
    return { model, usage, stop_reason: 'max_tokens', parsed_output: null };

  const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  // Por si el modelo envuelve el JSON en ```json … ```
  const json = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  let parsed: unknown = null;
  try {
    parsed = format.parse(json);
  } catch (err) {
    console.error('[ia] respuesta de Gemini no válida:', (err as Error).message.slice(0, 300));
  }
  return { model, usage, stop_reason: 'end_turn', parsed_output: parsed };
}
