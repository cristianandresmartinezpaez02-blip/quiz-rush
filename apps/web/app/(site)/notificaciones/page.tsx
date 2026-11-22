// Todas mis notificaciones, con el interruptor de push de este dispositivo.
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PushToggle } from '@/components/notifications/push-toggle';
import { listNotifications } from '@/lib/community-service';
import { requirePageUser } from '@/lib/session';
import { NotificationsList } from './notifications-list';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('notifications');
  return { title: t('title'), robots: { index: false } };
}

export default async function NotificationsPage() {
  const user = await requirePageUser('/notificaciones');
  const [t, first] = await Promise.all([
    getTranslations('notifications'),
    listNotifications(user.id),
  ]);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <h1 className="text-4xl font-extrabold">🔔 {t('title')}</h1>
      <PushToggle />
      <NotificationsList initial={first} />
    </div>
  );
}
