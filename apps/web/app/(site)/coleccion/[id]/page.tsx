// Página de una colección (propia o pública).
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Globe, Lock } from 'lucide-react';
import { QuizCard } from '@/components/library/quiz-card';
import { EmptyState } from '@/components/ui/empty-state';
import { getCollection } from '@/lib/community-service';
import { getCurrentUser } from '@/lib/session';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const user = await getCurrentUser();
  const c = await getCollection((await params).id, user?.id);
  return c ? { title: c.name } : {};
}

export default async function CollectionPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();
  const [collection, t] = await Promise.all([
    getCollection(id, user?.id),
    getTranslations('saved'),
  ]);
  if (!collection) notFound();

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      {collection.isMine && (
        <Link href="/guardados" className="mb-4 inline-block text-sm font-bold text-accent">
          ← {t('title')}
        </Link>
      )}
      <h1 className="text-4xl font-extrabold">📁 {collection.name}</h1>
      <p className="mt-2 flex items-center gap-2 text-sm font-bold text-muted">
        {collection.isPublic ? <Globe className="size-4" /> : <Lock className="size-4" />}
        {collection.isPublic ? t('public') : t('private')} ·{' '}
        {t('items', { count: collection.items.length })} ·{' '}
        <Link href={`/perfil/${collection.owner.username}`} className="hover:underline">
          @{collection.owner.username}
        </Link>
      </p>
      {collection.description && <p className="mt-3 max-w-2xl">{collection.description}</p>}
      <div className="mt-8">
        {collection.items.length === 0 ? (
          <EmptyState emoji="🗂️" title={t('emptyCollection')} />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {collection.items.map((q) => (
              <QuizCard key={q.id} quiz={q} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
