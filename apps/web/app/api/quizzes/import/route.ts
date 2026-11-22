// POST /api/quizzes/import (multipart: file, language) → crea un borrador desde CSV o Excel
import { ApiError, enforceRateLimit, json, requireUser, route } from '@/lib/api';
import { importQuiz } from '@/lib/quiz-io';

export const POST = route(async (req) => {
  const user = await requireUser(req);
  await enforceRateLimit(req, 'quiz-import', 20, 3600, user.id);
  const form = await req.formData().catch(() => {
    throw new ApiError(400, 'INVALID_FORM');
  });
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) throw new ApiError(400, 'IMPORT_FILE_REQUIRED');
  const language = form.get('language') === 'en' ? 'en' : 'es';
  const result = await importQuiz(
    user.id,
    { name: file.name, type: file.type, data: Buffer.from(await file.arrayBuffer()) },
    language,
  );
  return json(result, { status: 201 });
});
