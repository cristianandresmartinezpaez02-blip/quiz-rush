// Guardados: quizzes favoritos y colecciones del usuario.
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { listFavorites, listMyCollections } from '@/lib/community-service';
import { requirePageUser } from '@/lib/session';
import { SavedView } from './saved-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('saved');
  return { title: t('title') };
}

export default async function SavedPage() {
  const user = await requirePageUser('/guardados');
  const [t, favorites, collections] = await Promise.all([
    getTranslations('saved'),
    listFavorites(user.id),
    listMyCollections(user.id),
  ]);
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-4xl font-extrabold">{t('title')}</h1>
      <p className="mt-1 mb-8 text-muted">{t('subtitle')}</p>
      <SavedView initialFavorites={favorites} collections={collections} />
    </div>
  );
}
