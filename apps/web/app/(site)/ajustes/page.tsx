import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePageUser } from '@/lib/session';
import { SettingsForm } from './settings-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings');
  return { title: t('title') };
}

export default async function SettingsPage() {
  const user = await requirePageUser('/ajustes');
  const t = await getTranslations('settings');
  const p = user.profile;
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-4xl font-extrabold">{t('title')}</h1>
      <SettingsForm
        isGuest={user.isAnonymous}
        initial={{
          username: p?.username ?? '',
          displayName: p?.displayName ?? user.name,
          bio: p?.bio ?? '',
          country: p?.country ?? '',
          reduceMotion: p?.reduceMotion ?? false,
          highContrast: p?.highContrast ?? false,
          extraTimePercent: p?.extraTimePercent ?? 0,
          soundEnabled: p?.soundEnabled ?? true,
          textScale: (p?.textScale ?? 100) as 100 | 115 | 130,
          showOnline: p?.showOnline ?? true,
          allowFriendRequests: p?.allowFriendRequests ?? true,
        }}
      />
    </div>
  );
}
