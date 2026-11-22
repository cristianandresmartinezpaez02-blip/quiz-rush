// GET  /api/admin/users?q= → buscar personas (por usuario, nombre o correo)
// POST /api/admin/users { userId, banned?, role?, reason? } → bloquear/desbloquear o cambiar rol
import { z } from 'zod';
import { json, readJson, requireAdmin, route } from '@/lib/api';
import { searchUsers, setBan, setRole } from '@/lib/admin-service';

export const GET = route(async (req) => {
  await requireAdmin(req);
  return json({
    items: await searchUsers((new URL(req.url).searchParams.get('q') ?? '').slice(0, 60)),
  });
});

export const POST = route(async (req) => {
  const admin = await requireAdmin(req);
  const b = await readJson(
    req,
    z.object({
      userId: z.string().min(1).max(64),
      banned: z.boolean().optional(),
      role: z.enum(['admin', 'user']).optional(),
      reason: z.string().trim().max(200).optional(),
    }),
  );
  if (b.banned !== undefined) await setBan(admin.id, b.userId, b.banned, b.reason);
  if (b.role) await setRole(admin.id, b.userId, b.role);
  return json({ ok: true });
});
