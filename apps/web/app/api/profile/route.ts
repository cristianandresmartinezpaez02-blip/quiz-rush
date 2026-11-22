// PATCH /api/profile → actualiza el perfil del usuario actual.
import { db, Prisma } from '@quiz-rush/db';
import { profileUpdateSchema } from '@quiz-rush/shared';
import { ApiError, enforceRateLimit, json, readJson, requireUser, route } from '@/lib/api';

export const PATCH = route(async (req) => {
  const user = await requireUser(req);
  await enforceRateLimit(req, 'profile-update', 20, 60, user.id);
  const data = await readJson(req, profileUpdateSchema);
  // Los invitados no pueden reservar nombre de usuario hasta crear su cuenta
  if (data.username && user.isAnonymous) throw new ApiError(403, 'GUEST_CANNOT_CHANGE_USERNAME');

  try {
    const profile = await db.profile.update({
      where: { userId: user.id },
      data: { ...data, username: data.username?.toLowerCase() },
    });
    if (data.displayName)
      await db.user.update({ where: { id: user.id }, data: { name: data.displayName } });
    return json(profile);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ApiError(409, 'USERNAME_TAKEN');
    }
    throw err;
  }
});
