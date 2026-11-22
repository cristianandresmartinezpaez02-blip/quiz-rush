// POST   /api/presence { activity } → latido de presencia (cada 45 s con la pestaña visible)
// DELETE /api/presence → desconectarse (al cerrar sesión)
import { db } from '@quiz-rush/db';
import { presenceSchema } from '@quiz-rush/shared';
import { enforceRateLimit, json, readJson, requireUser, route } from '@/lib/api';
import { clearPresence, setPresence } from '@/lib/social-service';

export const POST = route(async (req) => {
  const user = await requireUser(req);
  await enforceRateLimit(req, 'presence', 30, 60, user.id);
  const { activity } = await readJson(req, presenceSchema);
  // Quien desactivó "mostrar si estoy en línea" no deja rastro
  const p = await db.profile.findUnique({
    where: { userId: user.id },
    select: { showOnline: true },
  });
  if (p?.showOnline === false) {
    await clearPresence(user.id);
    return json({ ok: true, hidden: true });
  }
  await setPresence(user.id, activity);
  return json({ ok: true });
});

export const DELETE = route(async (req) => {
  const user = await requireUser(req);
  await clearPresence(user.id);
  return json({ ok: true });
});
