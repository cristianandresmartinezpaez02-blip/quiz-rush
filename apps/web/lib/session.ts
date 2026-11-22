// Ayudas para leer la sesión en Server Components, Server Actions y Route Handlers.
import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@quiz-rush/db';
import { auth } from './auth';
import { isBanned } from './ban';

/** Sesión actual (memorizada durante la petición). */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/** Usuario actual con su perfil, o null si no hay sesión. */
export const getCurrentUser = cache(async () => {
  const session = await getSession();
  if (!session) return null;
  // Cuenta bloqueada: se trata como sin sesión (ver lib/ban.ts)
  if (session.user.banned || (await isBanned(session.user.id))) return null;
  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  return { ...session.user, isAnonymous: !!session.user.isAnonymous, profile };
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** Exige sesión en una página; si no hay, redirige al login y vuelve después. */
export async function requirePageUser(returnTo: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/entrar?volver=${encodeURIComponent(returnTo)}`);
  return user;
}
