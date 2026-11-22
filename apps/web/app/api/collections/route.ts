// GET  /api/collections → mis colecciones
// POST /api/collections { name, description?, isPublic? } → crear colección
import { collectionSchema } from '@quiz-rush/shared';
import { enforceRateLimit, json, readJson, requireUser, route } from '@/lib/api';
import { createCollection, listMyCollections } from '@/lib/community-service';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  return json({ items: await listMyCollections(user.id) });
});

export const POST = route(async (req) => {
  const user = await requireUser(req);
  await enforceRateLimit(req, 'collection-create', 20, 60, user.id);
  const data = await readJson(req, collectionSchema);
  return json(await createCollection(user.id, data), { status: 201 });
});
