// GET /api/collections/:id · PATCH (renombrar) · DELETE
import { collectionSchema } from '@quiz-rush/shared';
import { ApiError, json, optionalUser, readJson, requireUser, route } from '@/lib/api';
import { deleteCollection, getCollection, updateCollection } from '@/lib/community-service';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const viewer = await optionalUser(req);
  const { id } = await params;
  const collection = await getCollection(id, viewer?.id);
  if (!collection) throw new ApiError(404, 'COLLECTION_NOT_FOUND');
  return json(collection);
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id } = await params;
  return json(await updateCollection(user.id, id, await readJson(req, collectionSchema)));
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id } = await params;
  await deleteCollection(user.id, id);
  return json({ ok: true });
});
