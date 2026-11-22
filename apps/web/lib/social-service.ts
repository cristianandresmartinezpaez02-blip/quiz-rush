// Amigos, presencia en línea e invitaciones a partidas.
//
//  • Amistad: una fila Friendship por pareja. PENDING (requester → addressee), ACCEPTED o
//    BLOCKED (requester = quien bloquea). Quien bloquea deja de existir para el bloqueado:
//    no puede enviarle solicitudes ni verlo en la búsqueda.
//  • Presencia: el navegador envía un latido cada 45 s; se guarda en Redis con caducidad
//    (`presence:<userId>`), así no se escribe en Postgres en cada latido. `lastSeenAt` se
//    actualiza como mucho cada 5 minutos.
//  • Invitar a una partida en vivo: solo a amigos y con el PIN de una partida sin terminar.
import 'server-only';
import { db, Prisma } from '@quiz-rush/db';
import {
  MAX_FRIENDS,
  normalizeAvatar,
  PRESENCE,
  type FriendAction,
  type PresenceActivity,
} from '@quiz-rush/shared';
import { ApiError } from './api';
import { redis } from './redis';

const isUnique = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

const pairWhere = (a: string, b: string): Prisma.FriendshipWhereInput => ({
  OR: [
    { requesterId: a, addresseeId: b },
    { requesterId: b, addresseeId: a },
  ],
});

const personSelect = {
  id: true,
  profile: { select: { username: true, displayName: true, level: true, showOnline: true } },
  avatar: { select: { config: true } },
} satisfies Prisma.UserSelect;

type PersonRow = Prisma.UserGetPayload<{ select: typeof personSelect }>;

function person(u: PersonRow) {
  return {
    id: u.id,
    username: u.profile?.username ?? '',
    displayName: u.profile?.displayName ?? '—',
    level: u.profile?.level ?? 1,
    avatar: normalizeAvatar(u.avatar?.config),
  };
}

async function actorInfo(userId: string) {
  const p = await db.profile.findUnique({
    where: { userId },
    select: { username: true, displayName: true },
  });
  return { actorUsername: p?.username ?? '', actorName: p?.displayName ?? '—' };
}

async function friendCount(userId: string) {
  return db.friendship.count({
    where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] },
  });
}

// ───────────────────────── Amigos ─────────────────────────

export type FriendStatus = 'none' | 'friends' | 'outgoing' | 'incoming' | 'blocked';

/** Relación entre quien mira y otra persona (para el botón del perfil). */
export async function friendStatus(viewerId: string, otherId: string): Promise<FriendStatus> {
  if (viewerId === otherId) return 'none';
  const rows = await db.friendship.findMany({ where: pairWhere(viewerId, otherId) });
  for (const r of rows) {
    if (r.status === 'BLOCKED') return r.requesterId === viewerId ? 'blocked' : 'none';
  }
  const r = rows[0];
  if (!r) return 'none';
  if (r.status === 'ACCEPTED') return 'friends';
  return r.requesterId === viewerId ? 'outgoing' : 'incoming';
}

export async function sendFriendRequest(userId: string, username: string) {
  const target = await db.profile.findUnique({
    where: { username: username.toLowerCase() },
    select: { userId: true, allowFriendRequests: true, user: { select: { isAnonymous: true } } },
  });
  if (!target || target.user.isAnonymous) throw new ApiError(404, 'USER_NOT_FOUND');
  if (target.userId === userId) throw new ApiError(400, 'CANNOT_FRIEND_SELF');

  const rows = await db.friendship.findMany({ where: pairWhere(userId, target.userId) });
  // Bloqueo en cualquier sentido: para quien envía, la persona "no existe"
  if (rows.some((r) => r.status === 'BLOCKED')) throw new ApiError(404, 'USER_NOT_FOUND');
  const existing = rows[0];
  if (existing?.status === 'ACCEPTED') return { status: 'friends' as const };
  if (existing && existing.requesterId === userId) return { status: 'outgoing' as const };
  // La otra persona ya me lo había pedido: aceptar directamente
  if (existing) {
    await acceptRequest(userId, existing.id, target.userId);
    return { status: 'friends' as const };
  }

  if (!target.allowFriendRequests) throw new ApiError(403, 'FRIEND_REQUESTS_OFF');
  if ((await friendCount(userId)) >= MAX_FRIENDS) throw new ApiError(409, 'TOO_MANY_FRIENDS');

  try {
    await db.friendship.create({ data: { requesterId: userId, addresseeId: target.userId } });
  } catch (err) {
    if (!isUnique(err)) throw err;
    return { status: 'outgoing' as const };
  }
  await db.notification.create({
    data: { userId: target.userId, type: 'FRIEND_REQUEST', data: await actorInfo(userId) },
  });
  return { status: 'outgoing' as const };
}

async function acceptRequest(userId: string, friendshipId: string, requesterId: string) {
  if ((await friendCount(userId)) >= MAX_FRIENDS) throw new ApiError(409, 'TOO_MANY_FRIENDS');
  await db.friendship.update({ where: { id: friendshipId }, data: { status: 'ACCEPTED' } });
  // Avisar a quien la envió y retirar el aviso de solicitud pendiente
  await db.notification.create({
    data: { userId: requesterId, type: 'FRIEND_ACCEPTED', data: await actorInfo(userId) },
  });
}

export async function friendAction(userId: string, otherId: string, action: FriendAction) {
  if (userId === otherId) throw new ApiError(400, 'CANNOT_FRIEND_SELF');
  const rows = await db.friendship.findMany({ where: pairWhere(userId, otherId) });
  const incoming = rows.find((r) => r.requesterId === otherId && r.status === 'PENDING');
  const outgoing = rows.find((r) => r.requesterId === userId && r.status === 'PENDING');
  const friends = rows.find((r) => r.status === 'ACCEPTED');
  const myBlock = rows.find((r) => r.requesterId === userId && r.status === 'BLOCKED');

  switch (action) {
    case 'accept':
      if (!incoming) throw new ApiError(404, 'REQUEST_NOT_FOUND');
      await acceptRequest(userId, incoming.id, otherId);
      break;
    case 'decline':
      if (!incoming) throw new ApiError(404, 'REQUEST_NOT_FOUND');
      await db.friendship.delete({ where: { id: incoming.id } });
      break;
    case 'cancel':
      if (!outgoing) throw new ApiError(404, 'REQUEST_NOT_FOUND');
      await db.friendship.delete({ where: { id: outgoing.id } });
      break;
    case 'remove':
      if (!friends) throw new ApiError(404, 'NOT_FRIENDS');
      await db.friendship.delete({ where: { id: friends.id } });
      break;
    case 'block': {
      const exists = await db.user.findUnique({ where: { id: otherId }, select: { id: true } });
      if (!exists) throw new ApiError(404, 'USER_NOT_FOUND');
      await db.$transaction([
        db.friendship.deleteMany({
          where: {
            ...pairWhere(userId, otherId),
            NOT: { requesterId: otherId, status: 'BLOCKED' },
          },
        }),
        db.friendship.upsert({
          where: { requesterId_addresseeId: { requesterId: userId, addresseeId: otherId } },
          create: { requesterId: userId, addresseeId: otherId, status: 'BLOCKED' },
          update: { status: 'BLOCKED' },
        }),
      ]);
      break;
    }
    case 'unblock':
      if (!myBlock) throw new ApiError(404, 'NOT_BLOCKED');
      await db.friendship.delete({ where: { id: myBlock.id } });
      break;
  }
  return { status: await friendStatus(userId, otherId) };
}

/** Amigos (con presencia), solicitudes recibidas y enviadas, y bloqueados. */
export async function listFriends(userId: string) {
  const rows = await db.friendship.findMany({
    where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
    orderBy: { updatedAt: 'desc' },
    select: {
      status: true,
      requesterId: true,
      createdAt: true,
      requester: { select: personSelect },
      addressee: { select: personSelect },
    },
  });
  const friendsRows = rows.filter((r) => r.status === 'ACCEPTED');
  const others = friendsRows.map((r) => (r.requesterId === userId ? r.addressee : r.requester));
  const presence = await getPresence(
    others.filter((u) => u.profile?.showOnline !== false).map((u) => u.id),
  );
  const friends = others
    .map((u) => ({ ...person(u), presence: presence.get(u.id) ?? null }))
    .sort(
      (a, b) =>
        Number(!!b.presence) - Number(!!a.presence) || a.displayName.localeCompare(b.displayName),
    );

  return {
    friends,
    incoming: rows
      .filter((r) => r.status === 'PENDING' && r.requesterId !== userId)
      .map((r) => ({ ...person(r.requester), since: r.createdAt.toISOString() })),
    outgoing: rows
      .filter((r) => r.status === 'PENDING' && r.requesterId === userId)
      .map((r) => ({ ...person(r.addressee), since: r.createdAt.toISOString() })),
    blocked: rows
      .filter((r) => r.status === 'BLOCKED' && r.requesterId === userId)
      .map((r) => person(r.addressee)),
  };
}

/** Buscar personas para añadir (por usuario o nombre); excluye a quien me bloqueó. */
export async function searchPeople(userId: string, q: string) {
  const term = q.trim().replace(/^@/, '');
  if (term.length < 2) return [];
  const blockedMe = await db.friendship.findMany({
    where: { addresseeId: userId, status: 'BLOCKED' },
    select: { requesterId: true },
  });
  const users = await db.user.findMany({
    where: {
      id: { notIn: [userId, ...blockedMe.map((b) => b.requesterId)] },
      isAnonymous: { not: true },
      banned: { not: true },
      profile: {
        OR: [
          { username: { startsWith: term.toLowerCase() } },
          { displayName: { contains: term, mode: 'insensitive' } },
        ],
      },
    },
    take: 10,
    orderBy: { profile: { xp: 'desc' } },
    select: personSelect,
  });
  const statuses = await Promise.all(users.map((u) => friendStatus(userId, u.id)));
  return users.map((u, i) => ({ ...person(u), status: statuses[i]! }));
}

// ───────────────────────── Presencia ─────────────────────────

const presenceKey = (userId: string) => `presence:${userId}`;

export async function setPresence(userId: string, activity: PresenceActivity) {
  try {
    await redis.set(
      presenceKey(userId),
      JSON.stringify({ a: activity, t: Date.now() }),
      'EX',
      PRESENCE.ttlSeconds,
    );
    // lastSeenAt en Postgres como mucho cada 5 minutos por persona
    const fresh = await redis.set(`presence:seen:${userId}`, '1', 'EX', 300, 'NX');
    if (fresh)
      await db.profile
        .update({ where: { userId }, data: { lastSeenAt: new Date() } })
        .catch(() => {});
  } catch {
    /* Redis caído: la presencia es opcional */
  }
}

export async function clearPresence(userId: string) {
  await redis.del(presenceKey(userId)).catch(() => {});
}

/** Presencia de varias personas de una vez (un solo MGET). */
export async function getPresence(userIds: string[]) {
  const map = new Map<string, { activity: PresenceActivity; since: number }>();
  if (!userIds.length) return map;
  try {
    const values = await redis.mget(userIds.map(presenceKey));
    values.forEach((v, i) => {
      if (!v) return;
      const parsed = JSON.parse(v) as { a: PresenceActivity; t: number };
      map.set(userIds[i]!, { activity: parsed.a, since: parsed.t });
    });
  } catch {
    /* sin Redis: todos aparecen desconectados */
  }
  return map;
}

/** Cuántos amigos están conectados ahora (para el indicador del menú). */
export async function onlineFriendsCount(userId: string) {
  const { friends } = await listFriends(userId);
  return friends.filter((f) => f.presence).length;
}

// ───────────────────────── Invitaciones ─────────────────────────

/** Invita a amigos a una partida en vivo abierta (con su PIN). */
export async function inviteToGame(userId: string, friendIds: string[], pin: string) {
  const gameId = await redis.get(`pin:${pin}`).catch(() => null);
  if (!gameId) throw new ApiError(404, 'GAME_NOT_FOUND');
  const phase = await redis.hget(`g:{${gameId}}:meta`, 'phase').catch(() => null);
  if (phase === 'podium' || phase === 'ended') throw new ApiError(409, 'GAME_ENDED');

  const friendships = await db.friendship.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [
        { requesterId: userId, addresseeId: { in: friendIds } },
        { addresseeId: userId, requesterId: { in: friendIds } },
      ],
    },
    select: { requesterId: true, addresseeId: true },
  });
  const allowed = [
    ...new Set(friendships.map((f) => (f.requesterId === userId ? f.addresseeId : f.requesterId))),
  ];
  if (!allowed.length) throw new ApiError(403, 'NOT_FRIENDS');
  const actor = await actorInfo(userId);
  await db.notification.createMany({
    data: allowed.map((id) => ({ userId: id, type: 'GAME_INVITE', data: { ...actor, pin } })),
  });
  return { invited: allowed.length };
}
