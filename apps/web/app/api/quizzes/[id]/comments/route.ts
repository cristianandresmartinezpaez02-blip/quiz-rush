// GET  /api/quizzes/:id/comments?cursor= → comentarios (públicos)
// POST /api/quizzes/:id/comments { body, parentId? } → comentar o responder (requiere cuenta)
import { commentSchema } from '@quiz-rush/shared';
import { enforceRateLimit, json, optionalUser, readJson, requireAccount, route } from '@/lib/api';
import { addComment, listComments } from '@/lib/community-service';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const viewer = await optionalUser(req);
  const { id } = await params;
  const cursor = new URL(req.url).searchParams.get('cursor') ?? undefined;
  return json(await listComments(id, viewer?.id, cursor));
});

export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireAccount(req);
  // Antispam: máximo 6 comentarios por minuto y 60 por hora
  await enforceRateLimit(req, 'comment-min', 6, 60, user.id);
  await enforceRateLimit(req, 'comment-hour', 60, 3600, user.id);
  const { id } = await params;
  const { body, parentId } = await readJson(req, commentSchema);
  return json(await addComment(user.id, id, body, parentId), { status: 201 });
});
