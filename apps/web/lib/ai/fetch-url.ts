// Descarga una página web para usarla como material del generador, sin abrir la puerta a SSRF:
// solo http/https, puertos estándar, ninguna IP privada/local (comprobado tras resolver el DNS
// y en cada redirección), tiempo y tamaño máximos, y solo texto/HTML.
import 'server-only';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AI_LIMITS } from '@quiz-rush/shared';
import { ApiError } from '../api';

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

/** ¿Es una dirección que no debe alcanzarse desde el servidor? */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // enlace local (metadatos de la nube)
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
  return (
    v6 === '::' ||
    v6 === '::1' ||
    v6.startsWith('fc') ||
    v6.startsWith('fd') ||
    v6.startsWith('fe80') ||
    v6.startsWith('ff')
  );
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiError(400, 'URL_INVALID');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new ApiError(400, 'URL_INVALID');
  if (url.port && !['80', '443'].includes(url.port)) throw new ApiError(400, 'URL_BLOCKED');
  if (url.username || url.password) throw new ApiError(400, 'URL_INVALID');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new ApiError(400, 'URL_BLOCKED');
  }
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw new ApiError(400, 'URL_UNREACHABLE');
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new ApiError(400, 'URL_BLOCKED');
  return url;
}

/** Texto legible de un HTML (sin scripts, estilos ni etiquetas). */
export function htmlToText(html: string): { title: string; text: string } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? '';
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
  return { title: htmlToTextEntities(title), text: body };
}

const htmlToTextEntities = (s: string) => s.replace(/&amp;/g, '&').replace(/\s+/g, ' ');

/** Descarga la página y devuelve su texto (lanza un código de error claro si no se puede). */
export async function fetchPageText(
  raw: string,
): Promise<{ url: string; title: string; text: string }> {
  let current = await assertPublicUrl(raw.trim());
  for (let hop = 0; ; hop++) {
    const res = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'user-agent': 'QuizRushBot/1.0 (generador de quizzes)',
        accept: 'text/html,text/plain',
      },
    }).catch(() => {
      throw new ApiError(400, 'URL_UNREACHABLE');
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      if (hop >= MAX_REDIRECTS) throw new ApiError(400, 'URL_UNREACHABLE');
      current = await assertPublicUrl(new URL(res.headers.get('location')!, current).toString());
      continue;
    }
    if (!res.ok) throw new ApiError(400, 'URL_UNREACHABLE');
    const type = res.headers.get('content-type') ?? '';
    if (!/text\/html|text\/plain|application\/xhtml/.test(type))
      throw new ApiError(400, 'URL_NOT_TEXT');
    // Lectura con tope de tamaño (no se confía en content-length)
    const reader = res.body!.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new ApiError(413, 'URL_TOO_LARGE');
      }
      chunks.push(value);
    }
    const html = new TextDecoder().decode(Buffer.concat(chunks));
    const { title, text } = type.includes('text/plain')
      ? { title: '', text: html }
      : htmlToText(html);
    if (text.length < 200) throw new ApiError(422, 'URL_NO_CONTENT');
    // No se recorta en silencio: si la página es enorme, se pide pegar la parte que interesa
    if (text.length > AI_LIMITS.urlChars) throw new ApiError(413, 'URL_TOO_LONG');
    return { url: current.toString(), title, text };
  }
}
