'use client';
// Pantalla de amigos. La lista se refresca cada 30 s (presencia) mientras la pestaña está visible.
import { Ban, Check, Search, UserMinus, UserPlus, X } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { AvatarConfig, PresenceActivity } from '@quiz-rush/shared';
import { AvatarArt } from '@/components/avatar/avatar-art';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { apiFetch } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import { PresenceDot } from './presence-dot';

interface Person {
  id: string;
  username: string;
  displayName: string;
  level: number;
  avatar: AvatarConfig;
}
interface FriendsData {
  friends: (Person & { presence: { activity: PresenceActivity; since: number } | null })[];
  incoming: (Person & { since: string })[];
  outgoing: (Person & { since: string })[];
  blocked: Person[];
}
type SearchResult = Person & { status: 'none' | 'friends' | 'outgoing' | 'incoming' | 'blocked' };

const TABS = ['friends', 'requests', 'add', 'blocked'] as const;
type Tab = (typeof TABS)[number];

export function FriendsView({ initial, isGuest }: { initial: FriendsData; isGuest: boolean }) {
  const t = useTranslations('friends');
  const te = useTranslations('errors');
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<Tab>(initial.incoming.length ? 'requests' : 'friends');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const errorText = (c: string) => (te.has(c) ? te(c as 'INTERNAL') : te('INTERNAL'));

  const refresh = useCallback(async () => {
    setData(await apiFetch<FriendsData>('/api/friends'));
  }, []);

  useEffect(() => {
    const id = setInterval(
      () => document.visibilityState === 'visible' && void refresh().catch(() => {}),
      30_000,
    );
    return () => clearInterval(id);
  }, [refresh]);

  async function act(userId: string, action: string, ok?: string) {
    setBusy(userId + action);
    try {
      await apiFetch(`/api/friends/${userId}`, { method: 'POST', body: { action } });
      if (ok) toast.success(ok);
      await refresh();
      if (results)
        setResults(
          results.map((r) =>
            r.id === userId ? { ...r, status: action === 'block' ? 'blocked' : 'none' } : r,
          ),
        );
    } catch (err) {
      toast.error(errorText((err as Error).message));
    } finally {
      setBusy(null);
    }
  }

  async function request(p: SearchResult) {
    setBusy(p.id + 'request');
    try {
      const r = await apiFetch<{ status: SearchResult['status'] }>('/api/friends', {
        method: 'POST',
        body: { username: p.username },
      });
      setResults((rs) => rs?.map((x) => (x.id === p.id ? { ...x, status: r.status } : x)) ?? null);
      toast.success(
        r.status === 'friends' ? t('nowFriends', { name: p.displayName }) : t('requestSent'),
      );
      await refresh();
    } catch (err) {
      toast.error(errorText((err as Error).message));
    } finally {
      setBusy(null);
    }
  }

  async function search() {
    if (query.trim().length < 2) return;
    try {
      const r = await apiFetch<{ items: SearchResult[] }>(
        `/api/friends/search?q=${encodeURIComponent(query.trim())}`,
      );
      setResults(r.items);
    } catch (err) {
      toast.error(errorText((err as Error).message));
    }
  }

  const online = data.friends.filter((f) => f.presence).length;
  const counts: Record<Tab, number> = {
    friends: data.friends.length,
    requests: data.incoming.length,
    add: 0,
    blocked: data.blocked.length,
  };

  const row = (p: Person, extra: React.ReactNode, aside?: React.ReactNode) => (
    <li key={p.id} className="card flex items-center gap-3 p-3">
      <Link
        href={`/perfil/${p.username}`}
        className="relative shrink-0"
        aria-label={t('seeProfile', { name: p.displayName })}
      >
        <AvatarArt config={p.avatar} size={48} />
        {aside}
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={`/perfil/${p.username}`}
          className="block truncate font-extrabold hover:underline"
        >
          {p.displayName}
        </Link>
        <span className="text-sm text-muted">
          @{p.username} · {t('level', { level: p.level })}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">{extra}</div>
    </li>
  );

  if (isGuest) return <EmptyState emoji="🔒" title={t('guestTitle')} text={t('guestText')} />;

  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label={t('title')} className="flex flex-wrap gap-2">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={`tab-${k}`}
            aria-selected={tab === k}
            aria-controls={`panel-${k}`}
            onClick={() => setTab(k)}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 font-extrabold',
              tab === k ? 'bg-accent text-accent-ink' : 'bg-surface-2 hover:bg-line',
            )}
          >
            {t(`tabs.${k}`)}
            {counts[k] > 0 && (
              <span
                className={cn(
                  'rounded-full px-2 text-xs',
                  k === 'requests' ? 'bg-primary text-primary-ink' : 'bg-black/20',
                )}
              >
                {counts[k]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'friends' &&
          (data.friends.length === 0 ? (
            <EmptyState
              emoji="🫂"
              title={t('emptyTitle')}
              text={t('emptyText')}
              action={
                <Button onClick={() => setTab('add')}>
                  <UserPlus className="size-4" /> {t('tabs.add')}
                </Button>
              }
            />
          ) : (
            <>
              <p className="mb-3 text-sm font-bold text-muted">
                {t('onlineCount', { count: online })}
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.friends.map((f) =>
                  row(
                    f,
                    <>
                      <span className="mr-1 hidden text-xs font-bold text-muted sm:inline">
                        {f.presence ? t(`activity.${f.presence.activity}`) : t('offline')}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t('remove', { name: f.displayName })}
                        loading={busy === f.id + 'remove'}
                        onClick={() =>
                          confirm(t('removeConfirm', { name: f.displayName })) &&
                          void act(f.id, 'remove')
                        }
                      >
                        <UserMinus className="size-4" />
                      </Button>
                    </>,
                    <PresenceDot
                      activity={f.presence?.activity ?? null}
                      label={f.presence ? t(`activity.${f.presence.activity}`) : t('offline')}
                    />,
                  ),
                )}
              </ul>
            </>
          ))}

        {tab === 'requests' && (
          <div className="flex flex-col gap-6">
            <section aria-labelledby="incoming">
              <h2 id="incoming" className="mb-2 text-lg font-extrabold">
                {t('incoming')}
              </h2>
              {data.incoming.length === 0 ? (
                <p className="text-muted">{t('noIncoming')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.incoming.map((p) =>
                    row(
                      p,
                      <>
                        <Button
                          size="sm"
                          loading={busy === p.id + 'accept'}
                          onClick={() =>
                            void act(p.id, 'accept', t('nowFriends', { name: p.displayName }))
                          }
                        >
                          <Check className="size-4" /> {t('accept')}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t('decline')}
                          onClick={() => void act(p.id, 'decline')}
                        >
                          <X className="size-4" />
                        </Button>
                      </>,
                    ),
                  )}
                </ul>
              )}
            </section>
            {data.outgoing.length > 0 && (
              <section aria-labelledby="outgoing">
                <h2 id="outgoing" className="mb-2 text-lg font-extrabold">
                  {t('outgoing')}
                </h2>
                <ul className="flex flex-col gap-2">
                  {data.outgoing.map((p) =>
                    row(
                      p,
                      <Button size="sm" variant="ghost" onClick={() => void act(p.id, 'cancel')}>
                        {t('cancel')}
                      </Button>,
                    ),
                  )}
                </ul>
              </section>
            )}
          </div>
        )}

        {tab === 'add' && (
          <div className="flex flex-col gap-4">
            <form
              className="flex gap-2"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                void search();
              }}
            >
              <label htmlFor="people-q" className="sr-only">
                {t('searchLabel')}
              </label>
              <input
                id="people-q"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchPlaceholder')}
                autoComplete="off"
                className="h-12 min-w-0 flex-1 rounded-2xl border-2 border-line bg-surface px-4 font-bold outline-none focus:border-accent"
              />
              <Button type="submit" disabled={query.trim().length < 2}>
                <Search className="size-4" /> {t('search')}
              </Button>
            </form>
            {results &&
              (results.length === 0 ? (
                <p className="text-muted">{t('noResults')}</p>
              ) : (
                <ul className="flex flex-col gap-2" aria-live="polite">
                  {results.map((p) =>
                    row(
                      p,
                      p.status === 'friends' ? (
                        <span className="rounded-full bg-success/20 px-3 py-1 text-sm font-bold text-success">
                          ✓ {t('alreadyFriends')}
                        </span>
                      ) : p.status === 'outgoing' ? (
                        <span className="rounded-full bg-surface-2 px-3 py-1 text-sm font-bold">
                          {t('pending')}
                        </span>
                      ) : p.status === 'blocked' ? (
                        <span className="text-sm font-bold text-muted">{t('blockedLabel')}</span>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            loading={busy === p.id + 'request'}
                            onClick={() => void request(p)}
                          >
                            <UserPlus className="size-4" />{' '}
                            {p.status === 'incoming' ? t('accept') : t('add')}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={t('block', { name: p.displayName })}
                            onClick={() =>
                              confirm(t('blockConfirm', { name: p.displayName })) &&
                              void act(p.id, 'block', t('blockedDone'))
                            }
                          >
                            <Ban className="size-4" />
                          </Button>
                        </>
                      ),
                    ),
                  )}
                </ul>
              ))}
          </div>
        )}

        {tab === 'blocked' &&
          (data.blocked.length === 0 ? (
            <p className="text-muted">{t('noBlocked')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.blocked.map((p) =>
                row(
                  p,
                  <Button size="sm" variant="ghost" onClick={() => void act(p.id, 'unblock')}>
                    {t('unblock')}
                  </Button>,
                ),
              )}
            </ul>
          ))}
      </div>
    </div>
  );
}
