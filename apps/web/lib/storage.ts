// Almacenamiento de archivos (imágenes, GIFs y audio de las preguntas y portadas).
//  • Producción: Cloudinary (CDN + conversión automática a WebP/AVIF con f_auto,q_auto).
//  • Desarrollo sin claves: disco local (carpeta UPLOAD_DIR), servido por /api/media/file/…
import 'server-only';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type MediaKind = 'IMAGE' | 'GIF' | 'AUDIO';

export const ALLOWED_MIME: Record<string, { kind: MediaKind; ext: string; maxBytes: number }> = {
  'image/jpeg': { kind: 'IMAGE', ext: 'jpg', maxBytes: 8 * 1024 * 1024 },
  'image/png': { kind: 'IMAGE', ext: 'png', maxBytes: 8 * 1024 * 1024 },
  'image/webp': { kind: 'IMAGE', ext: 'webp', maxBytes: 8 * 1024 * 1024 },
  'image/avif': { kind: 'IMAGE', ext: 'avif', maxBytes: 8 * 1024 * 1024 },
  'image/gif': { kind: 'GIF', ext: 'gif', maxBytes: 10 * 1024 * 1024 },
  'audio/mpeg': { kind: 'AUDIO', ext: 'mp3', maxBytes: 10 * 1024 * 1024 },
  'audio/ogg': { kind: 'AUDIO', ext: 'ogg', maxBytes: 10 * 1024 * 1024 },
  'audio/wav': { kind: 'AUDIO', ext: 'wav', maxBytes: 10 * 1024 * 1024 },
  'audio/webm': { kind: 'AUDIO', ext: 'webm', maxBytes: 10 * 1024 * 1024 },
};

export interface StoredFile {
  provider: 'local' | 'cloudinary';
  key: string;
  url: string;
  width?: number;
  height?: number;
}

const cloudinary = {
  cloud: process.env.CLOUDINARY_CLOUD_NAME,
  key: process.env.CLOUDINARY_API_KEY,
  secret: process.env.CLOUDINARY_API_SECRET,
};
const useCloudinary = !!(cloudinary.cloud && cloudinary.key && cloudinary.secret);

export function uploadDir(): string {
  // turbopackIgnore: la carpeta es dinámica (variable de entorno); no debe incluirse en el build
  return path.resolve(
    /*turbopackIgnore: true*/ process.cwd(),
    process.env.UPLOAD_DIR ?? '.uploads',
  );
}

/**
 * Comprueba la "firma mágica" del archivo: no basta con el tipo MIME que dice el navegador.
 */
export function sniffMime(buf: Buffer): string | null {
  const hex = buf.subarray(0, 12).toString('hex');
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (hex.startsWith('89504e47')) return 'image/png';
  if (hex.startsWith('47494638')) return 'image/gif';
  if (hex.startsWith('52494646') && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.subarray(4, 12).toString().startsWith('ftypavi')) return 'image/avif';
  if (hex.startsWith('494433') || hex.startsWith('fffb') || hex.startsWith('fff3'))
    return 'audio/mpeg';
  if (hex.startsWith('4f676753')) return 'audio/ogg';
  if (hex.startsWith('52494646') && buf.subarray(8, 12).toString() === 'WAVE') return 'audio/wav';
  if (hex.startsWith('1a45dfa3')) return 'audio/webm';
  return null;
}

export async function storeFile(buf: Buffer, mime: string, ownerId: string): Promise<StoredFile> {
  const info = ALLOWED_MIME[mime];
  if (!info) throw new Error('Tipo de archivo no permitido');
  const hash = createHash('sha256').update(buf).digest('hex').slice(0, 24);

  if (useCloudinary) return uploadToCloudinary(buf, mime, `${ownerId}/${hash}`, info.kind);

  // Disco local (solo desarrollo)
  const key = `${ownerId}/${hash}.${info.ext}`;
  const filePath = path.join(/*turbopackIgnore: true*/ uploadDir(), key);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, buf);
  return { provider: 'local', key, url: `/api/media/file/${key}` };
}

export async function readLocalFile(key: string): Promise<Buffer | null> {
  const base = uploadDir();
  const filePath = path.resolve(/*turbopackIgnore: true*/ base, key);
  // Evita salir de la carpeta (path traversal: "../../etc/passwd")
  if (!filePath.startsWith(base + path.sep)) return null;
  try {
    return await readFile(filePath);
  } catch {
    return null;
  }
}

async function uploadToCloudinary(
  buf: Buffer,
  mime: string,
  publicId: string,
  kind: MediaKind,
): Promise<StoredFile> {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'quiz-rush';
  // Firma de la petición: parámetros ordenados + secreto (SHA-1), según la API de Cloudinary
  const toSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${cloudinary.secret}`;
  const signature = createHash('sha1').update(toSign).digest('hex');
  const resource = kind === 'AUDIO' ? 'video' : 'image';

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buf)], { type: mime }));
  form.append('api_key', cloudinary.key!);
  form.append('timestamp', String(timestamp));
  form.append('folder', folder);
  form.append('public_id', publicId);
  form.append('signature', signature);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudinary.cloud}/${resource}/upload`,
    { method: 'POST', body: form },
  );
  if (!res.ok) throw new Error(`Cloudinary respondió ${res.status}`);
  const data = (await res.json()) as {
    public_id: string;
    secure_url: string;
    width?: number;
    height?: number;
  };
  // f_auto,q_auto: Cloudinary sirve WebP/AVIF y la calidad óptima según el navegador
  const url =
    resource === 'image'
      ? data.secure_url.replace('/upload/', '/upload/f_auto,q_auto/')
      : data.secure_url;
  return {
    provider: 'cloudinary',
    key: data.public_id,
    url,
    width: data.width,
    height: data.height,
  };
}
