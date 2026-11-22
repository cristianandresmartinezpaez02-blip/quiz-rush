// Lógica de perfiles: creación automática al registrarse y migración de invitados.
import 'server-only';
import { db, Prisma } from '@quiz-rush/db';
import { suggestUsername } from '@quiz-rush/shared';

const GUEST_ANIMALS = [
  'Zorro',
  'Panda',
  'Pulpo',
  'Tigre',
  'Koala',
  'Búho',
  'Delfín',
  'Gato',
  'Lobo',
  'Dragón',
];

/** Nombre divertido para usuarios invitados: "Panda Veloz 4821". */
export function randomGuestName(): string {
  const animal = GUEST_ANIMALS[Math.floor(Math.random() * GUEST_ANIMALS.length)];
  return `${animal} ${Math.floor(1000 + Math.random() * 9000)}`;
}

/** Avatar inicial aleatorio (el editor de avatares llega en la Fase 5). */
function defaultAvatar() {
  const palette = ['#22d3ee', '#a3e635', '#fb923c', '#f472b6', '#a78bfa', '#2dd4bf'];
  return {
    base: 'blob',
    color: palette[Math.floor(Math.random() * palette.length)],
    eyes: 'happy',
    accessory: null,
  };
}

/**
 * Crea el perfil y el avatar de un usuario recién registrado.
 * Reintenta con otro nombre de usuario si el sugerido ya existe.
 */
export async function createProfileForUser(user: {
  id: string;
  name: string;
  email: string;
  isAnonymous?: boolean | null;
}) {
  const isGuest = !!user.isAnonymous;
  const source = isGuest ? 'invitado' : user.name || user.email;
  const displayName = (isGuest ? user.name : user.name || user.email.split('@')[0]!).slice(0, 32);

  for (let attempt = 0; attempt < 6; attempt++) {
    const username = suggestUsername(attempt < 4 ? source : `rusher${Date.now()}`).toLowerCase();
    try {
      await db.profile.create({
        data: { userId: user.id, username, displayName: displayName || username },
      });
      await db.avatar.create({ data: { userId: user.id, config: defaultAvatar() } });
      return;
    } catch (err) {
      const isUniqueViolation =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      // Si el perfil ya existe (doble llamada), no hay nada que hacer
      if (isUniqueViolation && (await db.profile.findUnique({ where: { userId: user.id } })))
        return;
      if (!isUniqueViolation) throw err;
    }
  }
  throw new Error('No se pudo generar un nombre de usuario único');
}

/**
 * Cuando un invitado crea su cuenta, todo lo que hizo como invitado pasa a la cuenta nueva
 * (quizzes, archivos, versiones y partidas). Después Better Auth borra el usuario invitado.
 */
export async function transferGuestData(fromUserId: string, toUserId: string) {
  await db.$transaction([
    // Favoritos: se copian ignorando los que la cuenta ya tuviera y luego se borran los del invitado
    db.$executeRaw`
      INSERT INTO "Favorite" ("userId", "quizId", "createdAt")
      SELECT ${toUserId}, "quizId", "createdAt" FROM "Favorite" WHERE "userId" = ${fromUserId}
      ON CONFLICT DO NOTHING`,
    db.favorite.deleteMany({ where: { userId: fromUserId } }),
    db.collection.updateMany({ where: { ownerId: fromUserId }, data: { ownerId: toUserId } }),
    db.quiz.updateMany({ where: { authorId: fromUserId }, data: { authorId: toUserId } }),
    db.media.updateMany({ where: { ownerId: fromUserId }, data: { ownerId: toUserId } }),
    db.quizVersion.updateMany({
      where: { createdById: fromUserId },
      data: { createdById: toUserId },
    }),
    db.player.updateMany({ where: { userId: fromUserId }, data: { userId: toUserId } }),
  ]);
  const quizzesCount = await db.quiz.count({
    where: { authorId: toUserId, status: 'PUBLISHED', deletedAt: null },
  });
  await db.profile.update({ where: { userId: toUserId }, data: { quizzesCount } });
}
