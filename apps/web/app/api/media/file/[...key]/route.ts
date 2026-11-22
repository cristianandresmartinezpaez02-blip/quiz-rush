// GET /api/media/file/:key → sirve archivos subidos en desarrollo (sin Cloudinary).
import { readLocalFile, sniffMime } from '@/lib/storage';

type Ctx = { params: Promise<{ key: string[] }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { key } = await params;
  const buf = await readLocalFile(key.join('/'));
  if (!buf) return new Response('No encontrado', { status: 404 });
  return new Response(new Uint8Array(buf), {
    headers: {
      'content-type': sniffMime(buf) ?? 'application/octet-stream',
      // El nombre del archivo es un hash del contenido: se puede cachear para siempre
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
