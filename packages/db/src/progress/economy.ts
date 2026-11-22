// Tienda, inventario, avatar, pase de temporada y cierre semanal de las ligas.
import {
  avatarConfigSchema,
  leagueOutcome,
  leagueReward,
  lockedParts,
  NEW_REVIEW,
  seasonTier,
  shopItem,
  sm2,
  type AvatarConfig,
  type LeagueTier,
  type SeasonReward,
} from '@quiz-rush/shared';
import { Prisma } from '../generated/prisma/client';
import { db } from '../index';
import { ensureCatalogs } from './catalogs';
import { grant } from './engine';

export class ProgressError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}

/** Códigos de los artículos que posee el jugador. */
export async function ownedItemCodes(userId: string): Promise<Set<string>> {
  const rows = await db.inventory.findMany({
    where: { userId },
    select: { item: { select: { code: true } } },
  });
  return new Set(rows.map((r) => r.item.code));
}

/** Compra un artículo con monedas (todo en una transacción con el perfil bloqueado). */
export async function buyItem(userId: string, code: string) {
  await ensureCatalogs();
  const def = shopItem(code);
  if (!def || def.seasonOnly) throw new ProgressError('ITEM_NOT_FOR_SALE', 404);
  return db.$transaction(async (tx) => {
    const item = await tx.shopItem.findUnique({
      where: { code },
      select: { id: true, price: true, active: true },
    });
    if (!item?.active) throw new ProgressError('ITEM_NOT_FOR_SALE', 404);
    const [profile] = await tx.$queryRaw<{ coins: number }[]>`
      SELECT "coins" FROM "Profile" WHERE "userId" = ${userId} FOR UPDATE`;
    if (!profile) throw new ProgressError('NO_PROFILE', 404);
    const owned = await tx.inventory.findUnique({
      where: { userId_itemId: { userId, itemId: item.id } },
    });
    if (owned) throw new ProgressError('ALREADY_OWNED', 409);
    if (profile.coins < item.price) throw new ProgressError('NOT_ENOUGH_COINS', 402);
    await tx.profile.update({ where: { userId }, data: { coins: { decrement: item.price } } });
    await tx.inventory.create({ data: { userId, itemId: item.id } });
    await tx.coinTransaction.create({
      data: { userId, amount: -item.price, reason: 'SHOP', refId: code },
    });
    return { coins: profile.coins - item.price };
  });
}

/** Guarda el avatar; solo se pueden usar piezas gratuitas o compradas. */
export async function saveAvatar(userId: string, raw: unknown): Promise<AvatarConfig> {
  const config = avatarConfigSchema.parse(raw);
  const locked = lockedParts(config, await ownedItemCodes(userId));
  if (locked.length) throw new ProgressError('ITEM_LOCKED', 403);
  await db.avatar.upsert({
    where: { userId },
    create: { userId, config },
    update: { config },
  });
  return config;
}

/** Elige la celebración (efecto al ganar); "confetti" es la gratuita. */
export async function equipCelebration(userId: string, code: string | null) {
  await ensureCatalogs();
  const owned = await db.inventory.findMany({
    where: { userId, item: { type: 'CELEBRATION' } },
    select: { itemId: true, item: { select: { code: true } } },
  });
  if (code && !owned.some((o) => o.item.code === code)) throw new ProgressError('ITEM_LOCKED', 403);
  await db.$transaction(
    owned.map((o) =>
      db.inventory.update({
        where: { userId_itemId: { userId, itemId: o.itemId } },
        data: { equipped: o.item.code === code },
      }),
    ),
  );
}

// ───────────────────────── Temporada ─────────────────────────

export async function activeSeason(at = new Date()) {
  await ensureCatalogs();
  return db.season.findFirst({ where: { startsAt: { lte: at }, endsAt: { gt: at } } });
}

/** Reclama la recompensa de un nivel del pase de temporada ya alcanzado. */
export async function claimSeasonTier(userId: string, tier: number) {
  const season = await activeSeason();
  if (!season) throw new ProgressError('NO_SEASON', 404);
  const rewards = season.rewards as unknown as SeasonReward[];
  const reward = rewards.find((r) => r.tier === tier);
  if (!reward) throw new ProgressError('NOT_FOUND', 404);
  const progress = await db.seasonProgress.findUnique({
    where: { seasonId_userId: { seasonId: season.id, userId } },
  });
  if (!progress || seasonTier(progress.points) < tier) throw new ProgressError('TIER_LOCKED', 403);

  const refId = `${season.id}:${tier}`;
  const outcome = await grant(
    userId,
    'SEASON',
    refId,
    0,
    reward.kind === 'coins' ? reward.amount : 0,
  );
  if (!outcome) throw new ProgressError('ALREADY_CLAIMED', 409);
  if (reward.kind === 'item') {
    const item = await db.shopItem.findUnique({
      where: { code: reward.code },
      select: { id: true },
    });
    if (item) {
      await db.inventory.upsert({
        where: { userId_itemId: { userId, itemId: item.id } },
        create: { userId, itemId: item.id },
        update: {},
      });
    }
  }
  await db.seasonProgress.update({
    where: { seasonId_userId: { seasonId: season.id, userId } },
    data: { claimed: { push: tier } },
  });
  return { reward, outcome };
}

// ───────────────────────── Ligas ─────────────────────────

/**
 * Cierra las ligas de una semana ya terminada: posiciones finales, ascensos, descensos y premios.
 * Idempotente: solo procesa grupos sin cerrar; los premios usan RewardLog (no se pagan dos veces).
 */
export async function closeLeagueWeek(weekKey: string) {
  const leagues = await db.league.findMany({
    where: { weekKey, members: { some: { finalPosition: null } } },
    select: { id: true, tier: true },
  });
  for (const league of leagues) {
    const members = await db.leagueMembership.findMany({
      where: { leagueId: league.id },
      orderBy: [{ weeklyXp: 'desc' }, { userId: 'asc' }],
    });
    const results = members.map((m, i) => ({
      userId: m.userId,
      position: i + 1,
      result: leagueOutcome(league.tier as LeagueTier, i + 1, members.length, m.weeklyXp),
    }));
    await db.$transaction(
      results.map((r) =>
        db.leagueMembership.update({
          where: { leagueId_userId: { leagueId: league.id, userId: r.userId } },
          data: { finalPosition: r.position, result: r.result },
        }),
      ),
    );
    for (const r of results) {
      const coins = leagueReward(r.position);
      if (coins > 0) await grant(r.userId, 'LEAGUE', league.id, 0, coins).catch(() => null);
      await db.notification
        .create({
          data: {
            userId: r.userId,
            type: 'LEAGUE_RESULT',
            data: { position: r.position, result: r.result, tier: league.tier, coins },
          },
        })
        .catch(() => null);
    }
  }
  return leagues.length;
}

// ───────────────────────── Repaso espaciado ─────────────────────────

export interface ReviewAnswer {
  questionId: string;
  /** Calidad SM-2 (0–5) */
  quality: number;
}

/**
 * Registra respuestas para el repaso inteligente.
 *  • Fuera del repaso: las preguntas falladas entran en la lista (para repasar desde hoy).
 *  • Dentro del repaso: cada respuesta reprograma su pregunta con SM-2.
 */
export async function recordReviewAnswers(
  userId: string,
  answers: ReviewAnswer[],
  { inReview }: { inReview: boolean },
) {
  if (!answers.length) return;
  // Solo preguntas que siguen existiendo (el snapshot de una partida puede tener preguntas borradas)
  const existing = new Set(
    (
      await db.question.findMany({
        where: { id: { in: answers.map((a) => a.questionId) } },
        select: { id: true },
      })
    ).map((q) => q.id),
  );
  const now = new Date();
  for (const a of answers) {
    if (!existing.has(a.questionId)) continue;
    const key = { userId_questionId: { userId, questionId: a.questionId } };
    const current = await db.reviewItem.findUnique({ where: key });
    if (!inReview) {
      // Fallo jugando: la pregunta queda para repasar HOY (si ya estaba programada para más
      // adelante, el fallo la adelanta y reinicia su progreso). Los aciertos fuera del repaso
      // no cambian nada: el repaso es lo que cuenta.
      if (a.quality >= 3) continue;
      if (!current) {
        await db.reviewItem
          .create({ data: { userId, questionId: a.questionId, dueAt: now } })
          .catch((err: unknown) => {
            if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'))
              throw err;
          });
      } else {
        await db.reviewItem.update({
          where: key,
          data: { repetitions: 0, intervalDay: 0, lapses: { increment: 1 }, dueAt: now },
        });
      }
      continue;
    }
    const next = sm2(current ?? NEW_REVIEW, a.quality, now);
    await db.reviewItem.upsert({
      where: key,
      create: { userId, questionId: a.questionId, ...next },
      update: next,
    });
  }
}

/**
 * Versión en lote para partidas grandes: añade al repaso las preguntas falladas (las que ya
 * estaban se respetan). Una sola consulta de inserción, sin importar cuántos jugadores fallaron.
 */
export async function addReviewItems(pairs: { userId: string; questionId: string }[]) {
  if (!pairs.length) return 0;
  const existing = new Set(
    (
      await db.question.findMany({
        where: { id: { in: [...new Set(pairs.map((p) => p.questionId))] } },
        select: { id: true },
      })
    ).map((q) => q.id),
  );
  const data = pairs.filter((p) => existing.has(p.questionId));
  let added = 0;
  for (let i = 0; i < data.length; i += 1000) {
    const res = await db.reviewItem.createMany({
      data: data.slice(i, i + 1000),
      skipDuplicates: true,
    });
    added += res.count;
  }
  return added;
}
