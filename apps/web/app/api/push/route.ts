// GET    /api/push → ¿está activado el push en el servidor? + clave pública VAPID
// POST   /api/push { endpoint, keys } → guardar la suscripción de este navegador
// DELETE /api/push { endpoint } → borrarla
import { z } from 'zod';
import { pushSubscriptionSchema } from '@quiz-rush/shared';
import { ApiError, enforceRateLimit, json, readJson, requireUser, route } from '@/lib/api';
import { deleteSubscription, pushEnabled, saveSubscription } from '@/lib/push';

export const GET = route(async () =>
  json({ enabled: pushEnabled(), publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null }),
);

export const POST = route(async (req) => {
  const user = await requireUser(req);
  if (!pushEnabled()) throw new ApiError(503, 'PUSH_DISABLED');
  await enforceRateLimit(req, 'push-subscribe', 10, 600, user.id);
  await saveSubscription(user.id, await readJson(req, pushSubscriptionSchema));
  return json({ ok: true }, { status: 201 });
});

export const DELETE = route(async (req) => {
  const user = await requireUser(req);
  const { endpoint } = await readJson(req, z.object({ endpoint: z.string().url().max(1000) }));
  await deleteSubscription(user.id, endpoint);
  return json({ ok: true });
});
