// GET /api/quizzes/:id/me → lo que el usuario actual ha hecho con el quiz (favorito, nota…)
import { json, requireUser, route } from '@/lib/api';
import { getViewerState } from '@/lib/community-service';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id } = await params;
  return json({ ...(await getViewerState(user.id, id)), isGuest: !!user.isAnonymous });
});
