// GET  /api/admin/quizzes → cola de moderación (marcados u ocultos)
// POST /api/admin/quizzes { quizId, action } → aprobar u ocultar
import { z } from 'zod';
import { json, readJson, requireAdmin, route } from '@/lib/api';
import { listModeration, setQuizVisibility } from '@/lib/admin-service';

export const GET = route(async (req) => {
  await requireAdmin(req);
  return json({ items: await listModeration() });
});

export const POST = route(async (req) => {
  await requireAdmin(req);
  const { quizId, action } = await readJson(
    req,
    z.object({ quizId: z.string().min(1).max(64), action: z.enum(['approve', 'hide']) }),
  );
  await setQuizVisibility(quizId, action);
  return json({ ok: true });
});
