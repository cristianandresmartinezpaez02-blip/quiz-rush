// POST /api/ai/generate (multipart: options = JSON, file = PDF o imagen opcional)
// → genera el quiz con IA y lo crea como borrador; devuelve su id para abrir el editor.
import { AI_LIMITS, aiGenerateOptionsSchema } from '@quiz-rush/shared';
import { ApiError, enforceRateLimit, json, requireAccount, route } from '@/lib/api';
import { generateQuizDoc } from '@/lib/ai/generate';
import { createQuiz } from '@/lib/quiz-service';

// Generar puede tardar (el modelo razona y escribe todo el quiz)
export const maxDuration = 300;

export const POST = route(async (req) => {
  const user = await requireAccount(req);
  await enforceRateLimit(req, 'ai-generate', 6, 60, user.id);
  const form = await req.formData().catch(() => {
    throw new ApiError(400, 'INVALID_FORM');
  });
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get('options') ?? '{}'));
  } catch {
    throw new ApiError(400, 'INVALID_JSON');
  }
  const options = aiGenerateOptionsSchema.parse(raw);
  const upload = form.get('file');
  let file = null;
  if (upload instanceof File && upload.size > 0) {
    if (upload.size > AI_LIMITS.fileBytes) throw new ApiError(413, 'AI_FILE_TOO_LARGE');
    file = { mediaType: upload.type, data: Buffer.from(await upload.arrayBuffer()) };
  }
  const { doc, discarded } = await generateQuizDoc(user.id, options, file);
  const id = await createQuiz(user.id, options.language, doc, 'AI');
  return json({ id, questions: doc.questions.length, discarded }, { status: 201 });
});
