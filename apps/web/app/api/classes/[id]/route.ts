// GET   /api/classes/:id → clase (vista de profe o de estudiante)
// PATCH /api/classes/:id → renombrar, archivar o cambiar el código (solo profe)
import { z } from 'zod';
import { json, readJson, requireUser, route } from '@/lib/api';
import { getClass, updateClass } from '@/lib/class-service';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  return json(await getClass(user.id, (await params).id));
});

const patchSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  archived: z.boolean().optional(),
  newCode: z.boolean().optional(),
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  return json(await updateClass(user.id, (await params).id, await readJson(req, patchSchema)));
});
