// POST /api/media → sube una imagen, GIF o audio (multipart/form-data, campo "file").
import { db } from '@quiz-rush/db';
import { ApiError, enforceRateLimit, json, requireUser, route } from '@/lib/api';
import { ALLOWED_MIME, sniffMime, storeFile } from '@/lib/storage';

export const POST = route(async (req) => {
  const user = await requireUser(req);
  await enforceRateLimit(req, 'media-upload', 30, 60 * 10, user.id);

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) throw new ApiError(400, 'FILE_REQUIRED');

  const buf = Buffer.from(await file.arrayBuffer());
  // El tipo real se deduce del contenido, no de lo que declara el navegador
  const mime = sniffMime(buf);
  const info = mime ? ALLOWED_MIME[mime] : undefined;
  if (!mime || !info) throw new ApiError(415, 'UNSUPPORTED_FILE');
  if (buf.byteLength > info.maxBytes)
    throw new ApiError(413, 'FILE_TOO_LARGE', { maxBytes: info.maxBytes });

  const stored = await storeFile(buf, mime, user.id);
  const media = await db.media.create({
    data: {
      ownerId: user.id,
      kind: info.kind,
      provider: stored.provider,
      key: stored.key,
      url: stored.url,
      mimeType: mime,
      size: buf.byteLength,
      width: stored.width,
      height: stored.height,
    },
    select: { id: true, url: true, kind: true },
  });
  return json(media, { status: 201 });
});
