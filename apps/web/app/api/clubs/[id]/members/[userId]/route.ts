// POST /api/clubs/:id/members/:userId { action } → ascender, degradar, expulsar o ceder el club
import { clubMemberActionSchema } from '@quiz-rush/shared';
import { json, readJson, requireAccount, route } from '@/lib/api';
import { memberAction } from '@/lib/club-service';

type Ctx = { params: Promise<{ id: string; userId: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireAccount(req);
  const { id, userId } = await params;
  const { action } = await readJson(req, clubMemberActionSchema);
  await memberAction(user.id, id, userId, action);
  return json({ ok: true });
});
