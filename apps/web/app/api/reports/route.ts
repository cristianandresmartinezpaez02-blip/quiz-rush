// POST /api/reports { targetType, targetId, reason, details? } → reportar contenido
import { reportSchema } from '@quiz-rush/shared';
import { enforceRateLimit, json, readJson, requireAccount, route } from '@/lib/api';
import { createReport } from '@/lib/community-service';

export const POST = route(async (req) => {
  const user = await requireAccount(req);
  await enforceRateLimit(req, 'report', 10, 3600, user.id);
  await createReport(user.id, await readJson(req, reportSchema));
  return json({ ok: true }, { status: 201 });
});
