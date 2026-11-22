// Sincroniza los catálogos (logros, misiones, tienda y temporada) de packages/shared con la base
// de datos. Es idempotente y se ejecuta una vez por proceso, la primera vez que hace falta:
// así producción no depende de acordarse de correr un script.
import {
  ACHIEVEMENTS,
  MISSIONS,
  seasonRewards,
  SHOP_ITEMS,
  type ShopItemDef,
} from '@quiz-rush/shared';
import { db } from '../index';

let ready: Promise<void> | null = null;

export function ensureCatalogs(): Promise<void> {
  ready ??= syncCatalogs().catch((err) => {
    ready = null; // reintenta en la próxima llamada
    throw err;
  });
  return ready;
}

/** Datos de presentación que guarda la fila ShopItem. */
function itemData(i: ShopItemDef) {
  return {
    ...(i.slot && { slot: i.slot, part: i.part }),
    ...(i.celebration && { celebration: i.celebration }),
    ...(i.seasonOnly && { seasonOnly: true }),
  };
}

async function syncCatalogs() {
  await Promise.all([
    ...ACHIEVEMENTS.map((x) =>
      db.achievement.upsert({
        where: { code: x.code },
        create: {
          code: x.code,
          icon: x.icon,
          category: x.category,
          threshold: x.threshold,
          rewardXp: x.rewardXp,
          rewardCoins: x.rewardCoins,
          secret: !!x.secret,
        },
        update: {
          icon: x.icon,
          category: x.category,
          threshold: x.threshold,
          rewardXp: x.rewardXp,
          rewardCoins: x.rewardCoins,
          secret: !!x.secret,
        },
      }),
    ),
    ...MISSIONS.map((x) =>
      db.mission.upsert({
        where: { code: x.code },
        create: {
          code: x.code,
          period: x.period,
          goalType: x.goalType,
          goalTarget: x.goalTarget,
          filter: x.mode ? { mode: x.mode } : undefined,
          rewardXp: x.rewardXp,
          rewardCoins: x.rewardCoins,
        },
        update: {
          goalType: x.goalType,
          goalTarget: x.goalTarget,
          rewardXp: x.rewardXp,
          rewardCoins: x.rewardCoins,
          active: true,
        },
      }),
    ),
  ]);

  // Temporada activa: si no hay ninguna, se abre una de 3 meses desde el inicio del mes
  const now = new Date();
  let season = await db.season.findFirst({
    where: { startsAt: { lte: now }, endsAt: { gt: now } },
  });
  if (!season) {
    const last = await db.season.findFirst({ orderBy: { number: 'desc' } });
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 1));
    const number = (last?.number ?? 0) + 1;
    season = await db.season
      .create({
        data: {
          number,
          name: `season${number}`,
          startsAt: start,
          endsAt: end,
          rewards: seasonRewards(),
        },
      })
      .catch(async () => (await db.season.findFirst({ where: { number } }))!);
  }

  await Promise.all(
    SHOP_ITEMS.map((i) =>
      db.shopItem.upsert({
        where: { code: i.code },
        create: {
          code: i.code,
          type: i.type,
          rarity: i.rarity,
          price: i.price,
          data: itemData(i),
          seasonId: i.seasonOnly ? season.id : null,
          active: !i.seasonOnly,
        },
        update: { price: i.price, rarity: i.rarity, data: itemData(i), active: !i.seasonOnly },
      }),
    ),
  );
}
