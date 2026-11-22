'use client';
// Pestañas de "Guardados": favoritos (paginados) y colecciones (crear, abrir, borrar).
import { FolderOpen, Globe, Lock, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { getTheme } from '@quiz-rush/shared';
import { QuizCard } from '@/components/library/quiz-card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/field';
import type { QuizCardData } from '@/lib/library-service';
import { cn } from '@/lib/utils';

interface CollectionSummary {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  itemCount: number;
  previews: { coverUrl: string | null; theme: string }[];
}

export function SavedView({
  initialFavorites,
  collections: initialCollections,
}: {
  initialFavorites: { items: QuizCardData[]; nextCursor: string | null };
  collections: CollectionSummary[];
}) {
  const t = useTranslations('saved');
  const [tab, setTab] = useState<'favorites' | 'collections'>('favorites');
  const [favorites, setFavorites] = useState(initialFavorites);
  const [collections, setCollections] = useState(initialCollections);
  const [name, setName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [creating, setCreating] = useState(false);

  async function loadMore() {
    if (!favorites.nextCursor) return;
    const res = await fetch(`/api/favorites?cursor=${favorites.nextCursor}`);
    if (!res.ok) return;
    const next = (await res.json()) as typeof favorites;
    setFavorites((f) => ({ items: [...f.items, ...next.items], nextCursor: next.nextCursor }));
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), isPublic }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const c = (await res.json()) as { id: string; name: string; isPublic: boolean };
      setCollections((list) => [{ ...c, description: null, itemCount: 0, previews: [] }, ...list]);
      setName('');
    } catch {
      toast.error(t('error'));
    } finally {
      setCreating(false);
    }
  }

  async function remove(c: CollectionSummary) {
    if (!confirm(t('deleteCollectionConfirm', { name: c.name }))) return;
    const res = await fetch(`/api/collections/${c.id}`, { method: 'DELETE' });
    if (res.ok) setCollections((list) => list.filter((x) => x.id !== c.id));
    else toast.error(t('error'));
  }

  return (
    <>
      <div role="tablist" className="mb-6 inline-flex rounded-2xl bg-surface-2 p-1">
        {(['favorites', 'collections'] as const).map((key) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'cursor-pointer rounded-xl px-5 py-2 font-extrabold',
              tab === key ? 'bg-accent text-accent-ink shadow' : 'text-muted hover:text-fg',
            )}
          >
            {key === 'favorites' ? `❤️ ${t('favorites')}` : `📁 ${t('collections')}`}
          </button>
        ))}
      </div>

      {tab === 'favorites' ? (
        favorites.items.length === 0 ? (
          <EmptyState
            emoji="💝"
            title={t('noFavoritesTitle')}
            text={t('noFavoritesText')}
            action={
              <Button asChild size="lg">
                <Link href="/biblioteca">{t('explore')}</Link>
              </Button>
            }
          />
        ) : (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {favorites.items.map((q) => (
                <QuizCard key={q.id} quiz={q} />
              ))}
            </div>
            {favorites.nextCursor && (
              <div className="mt-8 text-center">
                <Button variant="outline" onClick={loadMore}>
                  {t('loadMore')}
                </Button>
              </div>
            )}
          </>
        )
      ) : (
        <>
          <form onSubmit={create} className="card mb-6 flex flex-wrap items-center gap-3 p-4">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('newCollection')}
              aria-label={t('newCollection')}
              maxLength={60}
              className="min-w-48 flex-1"
            />
            <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="size-4 accent-accent"
              />
              {t('public')}
            </label>
            <Button type="submit" loading={creating} disabled={!name.trim()}>
              <Plus className="size-4" /> {t('create')}
            </Button>
          </form>
          {collections.length === 0 ? (
            <EmptyState emoji="📁" title={t('noCollectionsTitle')} text={t('noCollectionsText')} />
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {collections.map((c) => (
                <li
                  key={c.id}
                  className="card group relative overflow-hidden transition-transform hover:-translate-y-1"
                >
                  <Link href={`/coleccion/${c.id}`} className="block">
                    <div className="grid aspect-[2/1] grid-cols-2 grid-rows-2 gap-0.5">
                      {Array.from({ length: 4 }, (_, i) => {
                        const p = c.previews[i];
                        const theme = getTheme(p?.theme);
                        return (
                          <div
                            key={i}
                            className="grid place-items-center text-2xl"
                            style={{
                              background: p
                                ? `linear-gradient(135deg, ${theme.from}, ${theme.to})`
                                : 'var(--surface-2)',
                            }}
                          >
                            {p?.coverUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.coverUrl} alt="" className="size-full object-cover" />
                            ) : p ? (
                              theme.emoji
                            ) : (
                              <FolderOpen className="size-6 text-muted/40" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="p-4">
                      <h2 className="font-extrabold">{c.name}</h2>
                      <p className="flex items-center gap-1 text-xs font-bold text-muted">
                        {c.isPublic ? (
                          <Globe className="size-3.5" />
                        ) : (
                          <Lock className="size-3.5" />
                        )}
                        {c.isPublic ? t('public') : t('private')} ·{' '}
                        {t('items', { count: c.itemCount })}
                      </p>
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => remove(c)}
                    aria-label={`${t('delete')} ${c.name}`}
                    className="absolute top-2 right-2 grid size-8 cursor-pointer place-items-center rounded-lg bg-black/50 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
