'use client';
// Un club. Todos: ranking y quizzes. Miembros: añadir quizzes y salir. ADMIN/OWNER: código de
// invitación (clubes privados), expulsar; OWNER: ascender, ceder el club y borrarlo.
import {
  Copy,
  Crown,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserX,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { AvatarArt } from '@/components/avatar/avatar-art';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { apiFetch } from '@/lib/client-api';
import type { getClub } from '@/lib/club-service';
import { cn } from '@/lib/utils';
import { ClubBadge } from './clubs-view';

type Club = Awaited<ReturnType<typeof getClub>>;
type Role = 'OWNER' | 'ADMIN' | 'MEMBER';
const rank: Record<Role, number> = { MEMBER: 0, ADMIN: 1, OWNER: 2 };
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const MEDALS = ['🥇', '🥈', '🥉'];

interface QuizOption {
  id: string;
  title: string;
  questionCount: number;
}

export function ClubView({
  initial,
  me,
  signedIn,
}: {
  initial: Club;
  me: string | null;
  signedIn: boolean;
}) {
  const t = useTranslations('clubs');
  const te = useTranslations('errors');
  const router = useRouter();
  const [club, setClub] = useState(initial);
  const [tab, setTab] = useState<'ranking' | 'quizzes'>('ranking');
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<QuizOption[] | null>(null);
  const role = club.role as Role | null;
  const errorText = (c: string) => (te.has(c) ? te(c as 'INTERNAL') : te('INTERNAL'));

  async function refresh() {
    setClub(await apiFetch<Club>(`/api/clubs/${club.id}`));
  }

  async function act(fn: () => Promise<unknown>, ok?: string) {
    try {
      await fn();
      if (ok) toast.success(ok);
      await refresh();
    } catch (err) {
      toast.error(errorText((err as Error).message));
    }
  }

  async function search() {
    if (query.trim().length < 2) return;
    const r = await apiFetch<{ items: QuizOption[] }>(
      `/api/library?q=${encodeURIComponent(query.trim())}`,
    ).catch(() => ({ items: [] }));
    setResults(r.items);
  }

  const inviteLink = club.inviteCode ? `${appUrl}/clubes?codigo=${club.inviteCode}` : '';

  return (
    <div className="flex flex-col gap-6">
      <header className="card relative flex flex-wrap items-center gap-5 overflow-hidden p-6">
        <div
          className="absolute inset-x-0 top-0 h-2"
          style={{ background: club.color }}
          aria-hidden="true"
        />
        <ClubBadge emoji={club.emoji} color={club.color} size={80} />
        <div className="min-w-[14rem] flex-1">
          <h1 className="text-3xl font-extrabold">
            {club.name}{' '}
            {!club.isPublic && (
              <span className="text-xl" title={t('private')}>
                🔒
              </span>
            )}
          </h1>
          {club.description && <p className="text-muted">{club.description}</p>}
          <p className="mt-1 text-sm font-bold">
            {t('members', { count: club.memberCount })} · ⚡{' '}
            {t('totalPoints', { points: club.totalPoints })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {!role && club.isPublic && signedIn && me && (
            <Button
              onClick={() =>
                void act(
                  () => apiFetch(`/api/clubs/${club.id}/membership`, { method: 'POST' }),
                  t('joined'),
                )
              }
            >
              <LogIn className="size-4" /> {t('join')}
            </Button>
          )}
          {!role && !me && (
            <Button asChild variant="outline">
              <Link href={`/entrar?volver=/clubes/${club.slug}`}>{t('signInToJoin')}</Link>
            </Button>
          )}
          {role && (
            <Button
              variant="ghost"
              onClick={() =>
                confirm(role === 'OWNER' ? t('leaveOwnerConfirm') : t('leaveConfirm')) &&
                void apiFetch(`/api/clubs/${club.id}/membership`, { method: 'DELETE' })
                  .then(() => router.push('/clubes'))
                  .catch((err: Error) => toast.error(errorText(err.message)))
              }
            >
              <LogOut className="size-4" /> {t('leave')}
            </Button>
          )}
        </div>
        {club.inviteCode && (
          <div className="flex w-full flex-wrap items-center gap-3 rounded-2xl bg-surface-2 p-3">
            <span className="text-xs font-black tracking-widest text-muted uppercase">
              {t('inviteCode')}
            </span>
            <span className="font-display text-2xl font-black tracking-[0.25em]">
              {club.inviteCode}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(inviteLink).catch(() => {});
                toast.success(t('linkCopied'));
              }}
            >
              <Copy className="size-4" /> {t('copyLink')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                confirm(t('newCodeConfirm')) &&
                void act(() =>
                  apiFetch(`/api/clubs/${club.id}`, { method: 'PATCH', body: { newCode: true } }),
                )
              }
            >
              <RefreshCw className="size-4" /> {t('newCode')}
            </Button>
          </div>
        )}
      </header>

      <div role="tablist" aria-label={club.name} className="flex flex-wrap gap-2">
        {(['ranking', 'quizzes'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              'cursor-pointer rounded-xl px-4 py-2 font-extrabold',
              tab === k ? 'bg-accent text-accent-ink' : 'bg-surface-2 hover:bg-line',
            )}
          >
            {k === 'ranking' ? `🏆 ${t('ranking')}` : `📚 ${t('quizzes')} (${club.quizzes.length})`}
          </button>
        ))}
        {tab === 'quizzes' && role && (
          <Button className="ml-auto" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> {t('addQuiz')}
          </Button>
        )}
      </div>

      {tab === 'ranking' && (
        <ol className="flex flex-col gap-2" aria-label={t('ranking')}>
          {club.members.map((m, i) => {
            const canManage = role && rank[role] > rank[m.role] && m.userId !== me;
            return (
              <li
                key={m.userId}
                className={cn(
                  'card flex items-center gap-3 p-3',
                  m.userId === me && 'border-accent',
                )}
              >
                <span
                  className="w-8 text-center font-display text-xl font-black"
                  aria-label={t('position', { n: i + 1 })}
                >
                  {MEDALS[i] ?? i + 1}
                </span>
                <AvatarArt config={m.avatar} size={44} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/perfil/${m.username}`}
                    className="block truncate font-extrabold hover:underline"
                  >
                    {m.displayName}
                  </Link>
                  <span className="text-xs text-muted">
                    {m.role !== 'MEMBER' && (
                      <span className="mr-1 font-bold text-accent">
                        {m.role === 'OWNER' ? '👑' : '🛡️'} {t(`roles.${m.role}`)} ·
                      </span>
                    )}
                    {t('level', { level: m.level })}
                  </span>
                </div>
                <span className="font-display text-lg font-black tabular-nums">
                  ⚡ {m.points.toLocaleString()}
                </span>
                {canManage && (
                  <div className="flex gap-1">
                    {role === 'OWNER' && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={
                            m.role === 'ADMIN'
                              ? t('demote', { name: m.displayName })
                              : t('promote', { name: m.displayName })
                          }
                          title={
                            m.role === 'ADMIN'
                              ? t('demote', { name: m.displayName })
                              : t('promote', { name: m.displayName })
                          }
                          onClick={() =>
                            void act(() =>
                              apiFetch(`/api/clubs/${club.id}/members/${m.userId}`, {
                                method: 'POST',
                                body: { action: m.role === 'ADMIN' ? 'demote' : 'promote' },
                              }),
                            )
                          }
                        >
                          <Shield className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t('transfer', { name: m.displayName })}
                          title={t('transfer', { name: m.displayName })}
                          onClick={() =>
                            confirm(t('transferConfirm', { name: m.displayName })) &&
                            void act(() =>
                              apiFetch(`/api/clubs/${club.id}/members/${m.userId}`, {
                                method: 'POST',
                                body: { action: 'transfer' },
                              }),
                            )
                          }
                        >
                          <Crown className="size-4" />
                        </Button>
                      </>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t('kick', { name: m.displayName })}
                      title={t('kick', { name: m.displayName })}
                      onClick={() =>
                        confirm(t('kickConfirm', { name: m.displayName })) &&
                        void act(() =>
                          apiFetch(`/api/clubs/${club.id}/members/${m.userId}`, {
                            method: 'POST',
                            body: { action: 'kick' },
                          }),
                        )
                      }
                    >
                      <UserX className="size-4" />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {tab === 'quizzes' &&
        (club.quizzes.length === 0 ? (
          <p className="card p-8 text-center text-muted">
            {role ? t('noQuizzesMember') : t('noQuizzes')}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {club.quizzes.map((q) => (
              <li key={q.id} className="card flex items-center gap-3 p-4">
                <Link href={`/quiz/${q.id}`} className="min-w-0 flex-1">
                  <span className="block truncate font-extrabold hover:underline">{q.title}</span>
                  <span className="text-sm text-muted">
                    {t('questions', { count: q.questionCount })} ·{' '}
                    {t('plays', { count: q.playCount })}
                  </span>
                </Link>
                {role && (q.addedById === me || rank[role] >= rank.ADMIN) && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('removeQuiz', { title: q.title })}
                    onClick={() =>
                      void act(() =>
                        apiFetch(`/api/clubs/${club.id}/quizzes`, {
                          method: 'DELETE',
                          body: { quizId: q.id },
                        }),
                      )
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ))}

      {role === 'OWNER' && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            className="text-danger"
            onClick={() =>
              confirm(t('deleteConfirm')) &&
              void apiFetch(`/api/clubs/${club.id}`, { method: 'DELETE' })
                .then(() => router.push('/clubes'))
                .catch((err: Error) => toast.error(errorText(err.message)))
            }
          >
            <Trash2 className="size-4" /> {t('delete')}
          </Button>
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title={`📚 ${t('addQuiz')}`}>
        <form
          className="flex gap-2"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <label htmlFor="club-quiz-q" className="sr-only">
            {t('searchLibrary')}
          </label>
          <input
            id="club-quiz-q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchLibrary')}
            className="h-11 min-w-0 flex-1 rounded-xl border-2 border-line bg-surface px-3 outline-none focus:border-accent"
          />
          <Button type="submit" size="icon" variant="outline" aria-label={t('searchLibrary')}>
            <Search className="size-4" />
          </Button>
        </form>
        {results && (
          <ul className="mt-3 flex max-h-72 flex-col gap-1 overflow-y-auto">
            {results.length === 0 && <li className="text-muted">{t('noResults')}</li>}
            {results.map((q) => (
              <li key={q.id}>
                <button
                  type="button"
                  className="w-full cursor-pointer rounded-xl border-2 border-line px-3 py-2 text-left text-sm font-bold hover:border-accent"
                  onClick={() =>
                    void act(
                      () =>
                        apiFetch(`/api/clubs/${club.id}/quizzes`, {
                          method: 'POST',
                          body: { quizId: q.id },
                        }),
                      t('quizAdded'),
                    ).then(() => setAdding(false))
                  }
                >
                  {q.title}{' '}
                  <span className="font-normal text-muted">
                    · {t('questions', { count: q.questionCount })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
