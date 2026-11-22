// GET  /api/admin/reports?status= → reportes agrupados por contenido
// POST /api/admin/reports { targetType, targetId, decision } → resolver todos los de ese contenido
import { z } from 'zod';
import { json, readJson, requireAdmin, route } from '@/lib/api';
import { decideReport, listReports } from '@/lib/admin-service';

const statusSchema = z.enum(['OPEN', 'RESOLVED', 'DISMISSED']).catch('OPEN');

export const GET = route(async (req) => {
  await requireAdmin(req);
  return json({
    items: await listReports(statusSchema.parse(new URL(req.url).searchParams.get('status'))),
  });
});

const decisionSchema = z.object({
  targetType: z.enum(['QUIZ', 'COMMENT', 'USER']),
  targetId: z.string().min(1).max(64),
  decision: z.enum(['dismiss', 'hide', 'restore', 'ban']),
});

export const POST = route(async (req) => {
  const admin = await requireAdmin(req);
  const d = await readJson(req, decisionSchema);
  await decideReport(admin.id, d.targetType, d.targetId, d.decision);
  return json({ ok: true });
});
