// GET  /api/quizzes        → mis quizzes (paginación por cursor)
// POST /api/quizzes        → crea un quiz nuevo (borrador) y devuelve su id
import { z } from 'zod';
import { TEMPLATE_IDS, templateDoc } from '@quiz-rush/shared';
import { enforceRateLimit, json, readJson, requireUser, route } from '@/lib/api';
import { createQuiz, listMyQuizzes } from '@/lib/quiz-service';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  const cursor = new URL(req.url).searchParams.get('cursor') ?? undefined;
  return json(await listMyQuizzes(user.id, cursor));
});

const createSchema = z.object({
  language: z.enum(['es', 'en']).default('es'),
  /** Empezar desde una plantilla */
  template: z.enum(TEMPLATE_IDS as [string, ...string[]]).optional(),
});

export const POST = route(async (req) => {
  const user = await requireUser(req);
  await enforceRateLimit(req, 'quiz-create', 20, 60, user.id);
  const { language, template } = await readJson(req, createSchema);
  const id = template
    ? await createQuiz(
        user.id,
        language,
        templateDoc(template as never, language),
        `TEMPLATE:${template}`,
      )
    : await createQuiz(user.id, language);
  return json({ id }, { status: 201 });
});
