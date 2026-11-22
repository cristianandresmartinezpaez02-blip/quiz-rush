// GET  /api/notifications?cursor= → avisos del usuario + número sin leer
// POST /api/notifications { ids?: string[] } → marcar como leídos (todos si no se indican ids)
import { z } from 'zod';
import { json, readJson, requireUser, route } from '@/lib/api';
import { listNotifications, markNotificationsRead } from '@/lib/community-service';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  const cursor = new URL(req.url).searchParams.get('cursor') ?? undefined;
  return json(await listNotifications(user.id, cursor));
});

const readSchema = z.object({ ids: z.array(z.string().max(64)).max(100).optional() });

export const POST = route(async (req) => {
  const user = await requireUser(req);
  const { ids } = await readJson(req, readSchema);
  await markNotificationsRead(user.id, ids);
  return json({ ok: true });
});
