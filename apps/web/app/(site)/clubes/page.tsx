// Clubes: los míos, descubrir públicos, crear uno o entrar con código.
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ClubsView } from '@/components/social/clubs-view';
import { listClubs } from '@/lib/club-service';
import { getCurrentUser } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('clubs');
  return { title: t('title'), description: t('subtitle') };
}

export default async function ClubsPage({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string }>;
}) {
  const { codigo } = await searchParams;
  const user = await getCurrentUser();
  const [t, data] = await Promise.all([getTranslations('clubs'), listClubs(user?.id ?? null)]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-4xl font-extrabold">🛡️ {t('title')}</h1>
      <p className="mt-1 mb-6 text-muted">{t('subtitle')}</p>
      <ClubsView
        initial={data}
        canCreate={!!user && !user.isAnonymous}
        signedIn={!!user}
        initialCode={/^[A-Z0-9]{8}$/.test(codigo ?? '') ? codigo : undefined}
      />
    </div>
  );
}
