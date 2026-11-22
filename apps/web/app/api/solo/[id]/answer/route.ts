// POST /api/solo/:id/answer { qIndex, answer | timeout } → corregir en el servidor
import { enforceRateLimit, json, readJson, requireUser, route } from '@/lib/api';
import { answerSolo, soloAnswerSchema } from '@/lib/solo-service';

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  // El Rush puede llegar a ~2 respuestas por segundo
  await enforceRateLimit(req, 'solo-answer', 240, 60, user.id);
  const body = await readJson(req, soloAnswerSchema);
  return json(await answerSolo(user.id, (await params).id, body));
});
