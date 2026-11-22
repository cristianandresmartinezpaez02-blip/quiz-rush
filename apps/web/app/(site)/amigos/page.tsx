// Amigos: quién está en línea, solicitudes, buscar personas y bloqueados.
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FriendsView } from '@/components/social/friends-view';
import { listFriends } from '@/lib/social-service';
import { requirePageUser } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('friends');
  return { title: t('title'), robots: { index: false } };
}

export default async function FriendsPage() {
  const user = await requirePageUser('/amigos');
  const [t, data] = await Promise.all([getTranslations('friends'), listFriends(user.id)]);
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-4xl font-extrabold">🫂 {t('title')}</h1>
      <p className="mt-1 mb-6 text-muted">{t('subtitle')}</p>
      <FriendsView initial={data} isGuest={user.isAnonymous} />
    </div>
  );
}
