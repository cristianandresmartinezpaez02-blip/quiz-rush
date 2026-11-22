// Clubes: grupos de jugadores con ranking propio y quizzes favoritos.
//
//  • Públicos (cualquiera entra desde /clubes) o privados (solo con el código de invitación).
//  • Roles: OWNER (uno), ADMIN y MEMBER. El ranking del club suma el XP que gana cada
//    miembro desde que entró (lo hace el motor de progreso).
//  • Un club privado no existe para quien no es miembro (404).
import 'server-only';
import { db, Prisma } from '@quiz-rush/db';
import {
  CLUB_LIMITS,
  generateClubCode,
  normalizeAvatar,
  slugify,
  type CreateClubInput,
} from '@quiz-rush/shared';
import { ApiError } from './api';

const isUnique = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

type Role = 'OWNER' | 'ADMIN' | 'MEMBER';
const rank: Record<Role, number> = { MEMBER: 0, ADMIN: 1, OWNER: 2 };

async function membership(clubId: string, userId: string) {
  return db.clubMember.findUnique({
    where: { clubId_userId: { clubId, userId } },
    select: { role: true },
  });
}

async function requireRole(clubId: string, userId: string, min: Role) {
  const m = await membership(clubId, userId);
  if (!m) throw new ApiError(404, 'CLUB_NOT_FOUND');
  if (rank[m.role] < rank[min]) throw new ApiError(403, 'CLUB_FORBIDDEN');
  return m.role;
}

async function uniqueSlug(name: string) {
  const base = slugify(name, 36);
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${Math.floor(100 + Math.random() * 900)}`;
    if (!(await db.club.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  throw new ApiError(500, 'INTERNAL');
}

// ───────────────────────── Crear, listar, ver ─────────────────────────

export async function createClub(userId: string, input: CreateClubInput) {
  const owned = await db.clubMember.count({ where: { userId, role: 'OWNER' } });
  if (owned >= CLUB_LIMITS.owned) throw new ApiError(409, 'TOO_MANY_CLUBS');
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.club.create({
        data: {
          name: input.name,
          description: input.description || null,
          emoji: input.emoji,
          color: input.color,
          isPublic: input.isPublic,
          inviteCode: input.isPublic ? null : generateClubCode(),
          slug: await uniqueSlug(input.name),
          memberCount: 1,
          members: { create: { userId, role: 'OWNER' } },
        },
        select: { id: true, slug: true, inviteCode: true },
      });
    } catch (err) {
      if (!isUnique(err)) throw err;
    }
  }
  throw new ApiError(500, 'INTERNAL');
}

const cardSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  emoji: true,
  color: true,
  isPublic: true,
  memberCount: true,
} satisfies Prisma.ClubSelect;

/** Clubes públicos (búsqueda opcional) + los míos (también los privados). */
export async function listClubs(userId: string | null, q?: string) {
  const term = q?.trim();
  const [publicClubs, mine] = await Promise.all([
    db.club.findMany({
      where: {
        isPublic: true,
        ...(term && term.length >= 2 && { name: { contains: term, mode: 'insensitive' } }),
      },
      orderBy: [{ memberCount: 'desc' }, { createdAt: 'desc' }],
      take: 30,
      select: cardSelect,
    }),
    userId
      ? db.clubMember.findMany({
          where: { userId },
          orderBy: { joinedAt: 'desc' },
          select: { role: true, points: true, club: { select: cardSelect } },
        })
      : [],
  ]);
  return {
    mine: mine.map((m) => ({ ...m.club, role: m.role, myPoints: m.points })),
    discover: publicClubs,
  };
}

/** Un club por su slug (páginas) o su id (API). */
export async function getClub(key: { slug: string } | { id: string }, viewerId: string | null) {
  const club = await db.club.findUnique({
    where: key,
    select: {
      ...cardSelect,
      inviteCode: true,
      createdAt: true,
      members: {
        orderBy: [{ points: 'desc' }, { joinedAt: 'asc' }],
        take: CLUB_LIMITS.members,
        select: {
          role: true,
          points: true,
          joinedAt: true,
          user: {
            select: {
              id: true,
              profile: { select: { username: true, displayName: true, level: true } },
              avatar: { select: { config: true } },
            },
          },
        },
      },
      quizzes: {
        orderBy: { addedAt: 'desc' },
        take: CLUB_LIMITS.quizzes,
        where: { quiz: { status: 'PUBLISHED', deletedAt: null, visibility: 'PUBLIC' } },
        select: {
          addedById: true,
          addedAt: true,
          quiz: {
            select: {
              id: true,
              title: true,
              coverUrl: true,
              theme: true,
              questionCount: true,
              playCount: true,
            },
          },
        },
      },
    },
  });
  if (!club) throw new ApiError(404, 'CLUB_NOT_FOUND');
  const me = viewerId ? club.members.find((m) => m.user.id === viewerId) : undefined;
  if (!club.isPublic && !me) throw new ApiError(404, 'CLUB_NOT_FOUND');
  const role = (me?.role ?? null) as Role | null;
  const totalPoints = club.members.reduce((acc, m) => acc + m.points, 0);
  return {
    ...club,
    // El código solo lo ven quienes pueden invitar
    inviteCode: role && rank[role] >= rank.ADMIN ? club.inviteCode : null,
    createdAt: club.createdAt.toISOString(),
    role,
    totalPoints,
    members: club.members.map((m) => ({
      userId: m.user.id,
      username: m.user.profile?.username ?? '',
      displayName: m.user.profile?.displayName ?? '—',
      level: m.user.profile?.level ?? 1,
      avatar: normalizeAvatar(m.user.avatar?.config),
      role: m.role as Role,
      points: m.points,
      joinedAt: m.joinedAt.toISOString(),
    })),
    quizzes: club.quizzes.map((q) => ({
      ...q.quiz,
      addedById: q.addedById,
      addedAt: q.addedAt.toISOString(),
    })),
  };
}

// ───────────────────────── Entrar y salir ─────────────────────────

async function addMember(clubId: string, userId: string) {
  const club = await db.club.findUniqueOrThrow({
    where: { id: clubId },
    select: { memberCount: true, name: true, slug: true },
  });
  if (club.memberCount >= CLUB_LIMITS.members) throw new ApiError(409, 'CLUB_FULL');
  try {
    await db.$transaction([
      db.clubMember.create({ data: { clubId, userId } }),
      db.club.update({ where: { id: clubId }, data: { memberCount: { increment: 1 } } }),
    ]);
  } catch (err) {
    if (!isUnique(err)) throw err;
    return; // ya era miembro
  }
  // Aviso a quien lo creó
  const [owner, actor] = await Promise.all([
    db.clubMember.findFirst({ where: { clubId, role: 'OWNER' }, select: { userId: true } }),
    db.profile.findUnique({ where: { userId }, select: { username: true, displayName: true } }),
  ]);
  if (owner && owner.userId !== userId) {
    await db.notification.create({
      data: {
        userId: owner.userId,
        type: 'CLUB_JOINED',
        data: {
          actorName: actor?.displayName ?? '—',
          actorUsername: actor?.username ?? '',
          clubName: club.name,
          clubSlug: club.slug,
        },
      },
    });
  }
}

export async function joinPublicClub(userId: string, clubId: string) {
  const club = await db.club.findUnique({
    where: { id: clubId },
    select: { id: true, slug: true, isPublic: true },
  });
  if (!club || !club.isPublic) throw new ApiError(404, 'CLUB_NOT_FOUND');
  await addMember(club.id, userId);
  return { slug: club.slug };
}

export async function joinClubByCode(userId: string, code: string) {
  const club = await db.club.findUnique({
    where: { inviteCode: code },
    select: { id: true, slug: true },
  });
  if (!club) throw new ApiError(404, 'CLUB_CODE_NOT_FOUND');
  await addMember(club.id, userId);
  return { slug: club.slug };
}

async function removeMember(clubId: string, userId: string) {
  await db.$transaction(async (tx) => {
    const { count } = await tx.clubMember.deleteMany({ where: { clubId, userId } });
    if (count)
      await tx.club.update({ where: { id: clubId }, data: { memberCount: { decrement: count } } });
  });
}

/** Salir. Si sale quien lo creó: pasa a la persona con más antigüedad (o se borra si queda vacío). */
export async function leaveClub(userId: string, clubId: string) {
  const role = await requireRole(clubId, userId, 'MEMBER');
  if (role === 'OWNER') {
    const heir = await db.clubMember.findFirst({
      where: { clubId, userId: { not: userId } },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }], // ADMIN antes que MEMBER
      select: { userId: true },
    });
    if (!heir) {
      await db.club.delete({ where: { id: clubId } });
      return { deleted: true };
    }
    await db.clubMember.update({
      where: { clubId_userId: { clubId, userId: heir.userId } },
      data: { role: 'OWNER' },
    });
  }
  await removeMember(clubId, userId);
  return { deleted: false };
}

// ───────────────────────── Gestión ─────────────────────────

export async function updateClub(
  userId: string,
  clubId: string,
  input: Partial<CreateClubInput> & { newCode?: boolean },
) {
  await requireRole(clubId, userId, 'ADMIN');
  const current = await db.club.findUniqueOrThrow({
    where: { id: clubId },
    select: { isPublic: true, inviteCode: true },
  });
  const isPublic = input.isPublic ?? current.isPublic;
  const inviteCode = isPublic
    ? null
    : input.newCode || !current.inviteCode
      ? generateClubCode()
      : current.inviteCode;
  return db.club.update({
    where: { id: clubId },
    data: {
      ...(input.name && { name: input.name }),
      ...(input.description !== undefined && { description: input.description || null }),
      ...(input.emoji && { emoji: input.emoji }),
      ...(input.color && { color: input.color }),
      isPublic,
      inviteCode,
    },
    select: { slug: true, inviteCode: true, isPublic: true },
  });
}

export async function deleteClub(userId: string, clubId: string) {
  await requireRole(clubId, userId, 'OWNER');
  await db.club.delete({ where: { id: clubId } });
}

export async function memberAction(
  userId: string,
  clubId: string,
  targetId: string,
  action: 'promote' | 'demote' | 'kick' | 'transfer',
) {
  if (userId === targetId) throw new ApiError(400, 'CANNOT_TARGET_SELF');
  const myRole = await requireRole(clubId, userId, 'ADMIN');
  const target = await membership(clubId, targetId);
  if (!target) throw new ApiError(404, 'MEMBER_NOT_FOUND');
  // Nadie actúa sobre alguien de su mismo rango o superior
  if (rank[target.role] >= rank[myRole]) throw new ApiError(403, 'CLUB_FORBIDDEN');
  const where = { clubId_userId: { clubId, userId: targetId } };
  switch (action) {
    case 'kick':
      await removeMember(clubId, targetId);
      break;
    case 'promote':
    case 'demote':
      if (myRole !== 'OWNER') throw new ApiError(403, 'CLUB_FORBIDDEN');
      await db.clubMember.update({
        where,
        data: { role: action === 'promote' ? 'ADMIN' : 'MEMBER' },
      });
      break;
    case 'transfer':
      if (myRole !== 'OWNER') throw new ApiError(403, 'CLUB_FORBIDDEN');
      await db.$transaction([
        db.clubMember.update({ where, data: { role: 'OWNER' } }),
        db.clubMember.update({
          where: { clubId_userId: { clubId, userId } },
          data: { role: 'ADMIN' },
        }),
      ]);
      break;
  }
}

// ───────────────────────── Quizzes del club ─────────────────────────

export async function addClubQuiz(userId: string, clubId: string, quizId: string) {
  await requireRole(clubId, userId, 'MEMBER');
  const quiz = await db.quiz.findFirst({
    where: { id: quizId, status: 'PUBLISHED', deletedAt: null, visibility: 'PUBLIC' },
    select: { id: true },
  });
  if (!quiz) throw new ApiError(404, 'QUIZ_NOT_FOUND');
  const count = await db.clubQuiz.count({ where: { clubId } });
  if (count >= CLUB_LIMITS.quizzes) throw new ApiError(409, 'CLUB_QUIZZES_FULL');
  try {
    await db.clubQuiz.create({ data: { clubId, quizId, addedById: userId } });
  } catch (err) {
    if (!isUnique(err)) throw err;
  }
}

/** Quitar un quiz: quien lo añadió o un ADMIN/OWNER. */
export async function removeClubQuiz(userId: string, clubId: string, quizId: string) {
  const role = await requireRole(clubId, userId, 'MEMBER');
  const row = await db.clubQuiz.findUnique({ where: { clubId_quizId: { clubId, quizId } } });
  if (!row) throw new ApiError(404, 'QUIZ_NOT_FOUND');
  if (row.addedById !== userId && rank[role] < rank.ADMIN)
    throw new ApiError(403, 'CLUB_FORBIDDEN');
  await db.clubQuiz.delete({ where: { clubId_quizId: { clubId, quizId } } });
}
