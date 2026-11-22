'use client';
// Lista de clubes + crear (nombre, emoji, color, público/privado) + entrar con código.
import { KeyRound, Lock, Plus, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { CLUB_CODE_LENGTH, CLUB_COLORS, CLUB_EMOJIS } from '@quiz-rush/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { apiFetch } from '@/lib/client-api';
import { cn } from '@/lib/utils';

export interface ClubCard {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  emoji: string;
  color: string;
  isPublic: boolean;
  memberCount: number;
  role?: string;
  myPoints?: number;
}

export function ClubBadge({
  emoji,
  color,
  size = 56,
}: {
  emoji: string;
  color: string;
  size?: number;
}) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-2xl shadow-[0_4px_0_0_rgba(0,0,0,0.25)]"
      style={{ width: size, height: size, background: color, fontSize: size * 0.5 }}
      aria-hidden="true"
    >
      {emoji}
    </span>
  );
}

export function ClubsView({
  initial,
  canCreate,
  signedIn,
  initialCode,
}: {
  initial: { mine: ClubCard[]; discover: ClubCard[] };
  canCreate: boolean;
  signedIn: boolean;
  /** Código del enlace de invitación (?codigo=) */
  initialCode?: string;
}) {
  const t = useTranslations('clubs');
  const te = useTranslations('errors');
  const router = useRouter();
  const [discover, setDiscover] = useState(initial.discover);
  const [query, setQuery] = useState('');
  const [code, setCode] = useState(initialCode ?? '');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    emoji: CLUB_EMOJIS[0] as string,
    color: CLUB_COLORS[0] as string,
    isPublic: true,
  });
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const errorText = (c: string) => (te.has(c) ? te(c as 'INTERNAL') : te('INTERNAL'));

  async function search() {
    const r = await apiFetch<{ discover: ClubCard[] }>(
      `/api/clubs?q=${encodeURIComponent(query.trim())}`,
    );
    setDiscover(r.discover);
  }

  async function create() {
    setBusy('create');
    try {
      const club = await apiFetch<{ slug: string }>('/api/clubs', {
        method: 'POST',
        body: { ...form, description: form.description || undefined },
      });
      router.push(`/clubes/${club.slug}`);
    } catch (err) {
      toast.error(errorText((err as Error).message));
      setBusy(null);
    }
  }

  async function join() {
    setBusy('join');
    try {
      const { slug } = await apiFetch<{ slug: string }>('/api/clubs/join', {
        method: 'POST',
        body: { code },
      });
      router.push(`/clubes/${slug}`);
    } catch (err) {
      toast.error(errorText((err as Error).message));
      setBusy(null);
    }
  }

  const card = (c: ClubCard) => (
    <li key={c.id}>
      <Link
        href={`/clubes/${c.slug}`}
        className="card flex h-full items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:border-accent/60"
      >
        <ClubBadge emoji={c.emoji} color={c.color} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-lg font-extrabold">
            <span className="truncate">{c.name}</span>
            {!c.isPublic && (
              <Lock className="size-4 shrink-0 text-muted" aria-label={t('private')} />
            )}
          </span>
          <span className="block text-sm text-muted">
            <Users className="mr-1 inline size-4" aria-hidden="true" />
            {t('members', { count: c.memberCount })}
            {c.role && ` · ${t(`roles.${c.role}`)}`}
          </span>
          {c.description && (
            <span className="mt-1 line-clamp-2 block text-sm">{c.description}</span>
          )}
        </span>
      </Link>
    </li>
  );

  const field =
    'h-11 rounded-xl border-2 border-line bg-surface px-3 outline-none focus:border-accent';

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-stretch gap-3">
        {canCreate && (
          <Button size="lg" onClick={() => setOpen(true)}>
            <Plus className="size-5" /> {t('create')}
          </Button>
        )}
        {signedIn && (
          <form
            className="flex min-w-[16rem] flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.length === CLUB_CODE_LENGTH) void join();
            }}
          >
            <label htmlFor="club-code" className="sr-only">
              {t('codeLabel')}
            </label>
            <input
              id="club-code"
              value={code}
              onChange={(e) =>
                setCode(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, CLUB_CODE_LENGTH),
                )
              }
              placeholder={t('codePlaceholder')}
              autoComplete="off"
              className="h-14 min-w-0 flex-1 rounded-2xl border-2 border-line bg-surface px-4 text-center font-display text-xl font-black tracking-[0.2em] outline-none focus:border-accent"
            />
            <Button
              type="submit"
              size="lg"
              variant="outline"
              disabled={code.length !== CLUB_CODE_LENGTH}
              loading={busy === 'join'}
            >
              <KeyRound className="size-5" /> {t('joinWithCode')}
            </Button>
          </form>
        )}
      </div>

      {initial.mine.length > 0 && (
        <section aria-labelledby="my-clubs">
          <h2 id="my-clubs" className="mb-3 text-2xl font-extrabold">
            {t('mine')}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{initial.mine.map(card)}</ul>
        </section>
      )}

      <section aria-labelledby="discover">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="discover" className="text-2xl font-extrabold">
            {t('discover')}
          </h2>
          <form
            role="search"
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <label htmlFor="club-q" className="sr-only">
              {t('search')}
            </label>
            <input
              id="club-q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search')}
              className={field}
            />
            <Button type="submit" size="icon" variant="outline" aria-label={t('search')}>
              <Search className="size-4" />
            </Button>
          </form>
        </div>
        {discover.length === 0 ? (
          <EmptyState emoji="🛡️" title={t('emptyTitle')} text={t('emptyText')} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{discover.map(card)}</ul>
        )}
      </section>

      <Modal open={open} onClose={() => setOpen(false)} title={`🛡️ ${t('create')}`}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (form.name.trim().length >= 3) void create();
          }}
        >
          <div className="flex items-center gap-3">
            <ClubBadge emoji={form.emoji} color={form.color} size={64} />
            <label className="flex flex-1 flex-col gap-1 text-sm font-bold">
              {t('name')}
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={40}
                required
                className={field}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm font-bold">
            {t('description')}
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              maxLength={200}
              rows={2}
              className="rounded-xl border-2 border-line bg-surface px-3 py-2 outline-none focus:border-accent"
            />
          </label>
          <fieldset>
            <legend className="mb-1 text-sm font-bold">{t('emoji')}</legend>
            <div className="flex flex-wrap gap-1">
              {CLUB_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-pressed={form.emoji === e}
                  onClick={() => setForm({ ...form, emoji: e })}
                  className={cn(
                    'grid size-10 cursor-pointer place-items-center rounded-xl text-xl',
                    form.emoji === e ? 'bg-accent/30 ring-2 ring-accent' : 'bg-surface-2',
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-sm font-bold">{t('color')}</legend>
            <div className="flex flex-wrap gap-2">
              {CLUB_COLORS.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={form.color === c}
                  aria-label={t('colorN', { n: i + 1 })}
                  onClick={() => setForm({ ...form, color: c })}
                  className={cn(
                    'size-9 cursor-pointer rounded-full',
                    form.color === c && 'ring-4 ring-fg ring-offset-2 ring-offset-surface',
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          </fieldset>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={!form.isPublic}
              onChange={(e) => setForm({ ...form, isPublic: !e.target.checked })}
              className="mt-0.5 size-5"
            />
            <span>
              <span className="font-bold">🔒 {t('privateOption')}</span>
              <span className="block text-muted">{t('privateHelp')}</span>
            </span>
          </label>
          <Button type="submit" disabled={form.name.trim().length < 3} loading={busy === 'create'}>
            {t('create')}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
