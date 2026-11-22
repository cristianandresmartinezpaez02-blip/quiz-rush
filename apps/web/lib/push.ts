// Notificaciones push (Web Push con claves VAPID).
//
// Las notificaciones se siguen creando como siempre (filas Notification, en la web, en el motor
// de progreso o en el servidor de tiempo real). Un "repartidor" las recoge y envía el push:
//  • Se reclaman con `FOR UPDATE SKIP LOCKED`: varias réplicas de la web nunca envían dos veces.
//  • Corre como mucho cada 10 s en todo el clúster, tras cualquier petición al API (`after`).
//  • Solo tipos de PUSH_NOTIFICATION_TYPES y de la última hora; el texto va en el idioma de
//    cada persona. Las suscripciones caducadas (404/410) se borran solas.
// Con el worker (Fase 8) corre cada 10 s aunque nadie use la web; sin él, tras las peticiones.
import 'server-only';
import { db } from '@quiz-rush/db';
import { PUSH_NOTIFICATION_TYPES } from '@quiz-rush/shared';
import { createTranslator } from 'next-intl';
import { sendNotification, setVapidDetails, WebPushError } from 'web-push';
import en from '../messages/en.json';
import es from '../messages/es.json';
import { runAtMostEvery } from './cache';
import { workerAlive } from './jobs';
import {
  NOTIFICATION_ICONS,
  notificationHref,
  notificationText,
  type NotificationData,
  type Translator,
} from './notification-text';

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';

export function pushEnabled() {
  return !!(PUBLIC_KEY && PRIVATE_KEY);
}

let configured = false;
function configure() {
  if (configured || !pushEnabled()) return configured;
  setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@quizrush.dev',
    PUBLIC_KEY,
    PRIVATE_KEY,
  );
  configured = true;
  return true;
}

export async function saveSubscription(
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
) {
  // Un mismo navegador puede cambiar de cuenta: la suscripción pasa a la cuenta actual
  await db.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
  // Máximo 10 dispositivos por persona: se borran los más antiguos
  const extra = await db.pushSubscription.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    skip: 10,
    select: { id: true },
  });
  if (extra.length)
    await db.pushSubscription.deleteMany({ where: { id: { in: extra.map((e) => e.id) } } });
}

export async function deleteSubscription(userId: string, endpoint: string) {
  await db.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

const MESSAGES = { es, en } as const;
function translators(locale: string) {
  const messages = MESSAGES[locale === 'en' ? 'en' : 'es'];
  const lang = locale === 'en' ? 'en' : 'es';
  return {
    t: createTranslator({
      locale: lang,
      messages,
      namespace: 'notifications',
    }) as unknown as Translator,
    ta: createTranslator({
      locale: lang,
      messages,
      namespace: 'achievements',
    }) as unknown as Translator,
  };
}

interface Claimed {
  id: string;
  userId: string;
  type: string;
  data: NotificationData;
}

/** Reclama y envía los push pendientes. Devuelve cuántos se enviaron. */
export async function deliverPendingPush(limit = 200): Promise<number> {
  if (!configure()) return 0;
  const types = PUSH_NOTIFICATION_TYPES as readonly string[];
  // Reclamar: marca como enviadas (pushedAt) y devuelve las filas en una sola sentencia
  const claimed = await db.$queryRaw<Claimed[]>`
    UPDATE "Notification" SET "pushedAt" = now()
    WHERE id IN (
      SELECT id FROM "Notification"
      WHERE "pushedAt" IS NULL AND "createdAt" > now() - interval '1 hour'
      ORDER BY "createdAt"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, "userId", type, data`;
  // Las viejas que nunca se enviaron (p. ej. con el push apagado) se descartan
  await db.notification.updateMany({
    where: { pushedAt: null, createdAt: { lte: new Date(Date.now() - 3600_000) } },
    data: { pushedAt: new Date() },
  });

  const relevant = claimed.filter((n) => types.includes(n.type));
  if (!relevant.length) return 0;
  const userIds = [...new Set(relevant.map((n) => n.userId))];
  const [subs, profiles] = await Promise.all([
    db.pushSubscription.findMany({ where: { userId: { in: userIds } } }),
    db.profile.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, locale: true },
    }),
  ]);
  if (!subs.length) return 0;
  const localeOf = new Map(profiles.map((p) => [p.userId, p.locale]));

  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    relevant.flatMap((n) => {
      const { t, ta } = translators(localeOf.get(n.userId) ?? 'es');
      const payload = JSON.stringify({
        title: `${NOTIFICATION_ICONS[n.type] ?? '🔔'} Quiz_Rush`,
        body: notificationText(t, ta, n),
        url: notificationHref(n),
        tag: `${n.type}:${n.id}`,
      });
      return subs
        .filter((s) => s.userId === n.userId)
        .map(async (s) => {
          try {
            await sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              payload,
              {
                TTL: 24 * 3600,
                urgency: n.type === 'GAME_INVITE' ? 'high' : 'normal',
                timeout: 8000,
              },
            );
            sent++;
          } catch (err) {
            if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) {
              dead.push(s.id);
            } else {
              console.error('[push] envío fallido:', (err as Error).message);
            }
          }
        });
    }),
  );
  if (dead.length) await db.pushSubscription.deleteMany({ where: { id: { in: dead } } });
  return sent;
}

/** Respaldo sin worker: tras cualquier petición al API, como mucho cada 10 s. */
export async function pushSweep() {
  if (!pushEnabled() || (await workerAlive())) return;
  await runAtMostEvery('push-sweep', 10, () => deliverPendingPush());
}
