'use client';
// Panel de administración: resumen, reportes (agrupados por contenido), cola de moderación,
// usuarios (bloquear, rol) y uso de la IA. Cada pestaña carga sus datos al abrirse.
import { Ban, Check, EyeOff, RotateCcw, Search, ShieldCheck, X } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/client-api';
import { cn } from '@/lib/utils';

type Stats = Record<string, number>;
interface ReportGroup {
  targetType: 'QUIZ' | 'COMMENT' | 'USER';
  targetId: string;
  target: { label: string; href: string; state: string; author?: string } | null;
  count: number;
  reports: {
    id: string;
    reason: string;
    details: string | null;
    reporter: string;
    createdAt: string;
  }[];
}
interface ModItem {
  id: string;
  title: string;
  status: string;
  moderationStatus: string;
  hiddenReason: string | null;
  author: string;
  updatedAt: string;
}
interface UserRow {
  id: string;
  email: string;
  role: string;
  banned: boolean;
  username: string;
  displayName: string;
  level: number;
  quizzes: number;
  createdAt: string;
  lastSeenAt: string | null;
}
interface AiRow {
  day: string;
  kind: string;
  requests: number;
  failed: number;
  tokens: number;
}

const TABS = ['overview', 'reports', 'moderation', 'users', 'ai'] as const;
type Tab = (typeof TABS)[number];

export function AdminView({ initialStats, me }: { initialStats: Stats; me: string }) {
  const t = useTranslations('admin');
  const te = useTranslations('errors');
  const tr = useTranslations('quiz.reportReasons');
  const format = useFormatter();
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState(initialStats);
  const [reports, setReports] = useState<ReportGroup[] | null>(null);
  const [mod, setMod] = useState<ModItem[] | null>(null);
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [ai, setAi] = useState<AiRow[] | null>(null);
  const [q, setQ] = useState('');
  const errorText = (c: string) => (te.has(c) ? te(c as 'INTERNAL') : te('INTERNAL'));

  const load = useCallback(
    async (which: Tab, query = '') => {
      try {
        if (which === 'overview') setStats(await apiFetch<Stats>('/api/admin/stats'));
        if (which === 'reports')
          setReports((await apiFetch<{ items: ReportGroup[] }>('/api/admin/reports')).items);
        if (which === 'moderation')
          setMod((await apiFetch<{ items: ModItem[] }>('/api/admin/quizzes')).items);
        if (which === 'users')
          setUsers(
            (
              await apiFetch<{ items: UserRow[] }>(
                `/api/admin/users?q=${encodeURIComponent(query)}`,
              )
            ).items,
          );
        if (which === 'ai') setAi((await apiFetch<{ items: AiRow[] }>('/api/admin/ai')).items);
      } catch (err) {
        toast.error(errorText((err as Error).message));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    // Carga diferida: el efecto solo programa la petición
    const id = setTimeout(() => void load(tab), 0);
    return () => clearTimeout(id);
  }, [tab, load]);

  async function act(fn: () => Promise<unknown>, reload: Tab, ok = t('done')) {
    try {
      await fn();
      toast.success(ok);
      await load(reload, q);
    } catch (err) {
      toast.error(errorText((err as Error).message));
    }
  }

  const decide = (g: ReportGroup, decision: 'dismiss' | 'hide' | 'restore' | 'ban') =>
    act(
      () =>
        apiFetch('/api/admin/reports', {
          method: 'POST',
          body: { targetType: g.targetType, targetId: g.targetId, decision },
        }),
      'reports',
    );

  const STAT_KEYS = [
    'users',
    'newUsers',
    'published',
    'hidden',
    'games24',
    'openReports',
    'flagged',
    'aiRequests24',
    'aiTokens24',
  ];

  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label={t('title')} className="flex flex-wrap gap-2">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 font-extrabold',
              tab === k ? 'bg-accent text-accent-ink' : 'bg-surface-2 hover:bg-line',
            )}
          >
            {t(`tabs.${k}`)}
            {k === 'reports' && (stats.openReports ?? 0) > 0 && (
              <span className="rounded-full bg-danger px-2 text-xs text-danger-ink">
                {stats.openReports}
              </span>
            )}
            {k === 'moderation' && (stats.flagged ?? 0) > 0 && (
              <span className="rounded-full bg-[#fb923c] px-2 text-xs text-white">
                {stats.flagged}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {STAT_KEYS.map((k) => (
            <div key={k} className="card p-4">
              <dt className="text-xs font-black tracking-wider text-muted uppercase">
                {t(`stats.${k}`)}
              </dt>
              <dd className="font-display text-3xl font-black">{format.number(stats[k] ?? 0)}</dd>
            </div>
          ))}
        </dl>
      )}

      {tab === 'reports' &&
        (!reports ? (
          <p className="text-muted">…</p>
        ) : reports.length === 0 ? (
          <p className="card p-8 text-center text-muted">✅ {t('noReports')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {reports.map((g) => (
              <li key={g.targetType + g.targetId} className="card flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-black">
                    {t(`targets.${g.targetType}`)}
                  </span>
                  <div className="min-w-0 flex-1">
                    {g.target ? (
                      <Link
                        href={g.target.href}
                        target="_blank"
                        className="line-clamp-2 font-extrabold hover:underline"
                      >
                        {g.target.label}
                      </Link>
                    ) : (
                      <span className="text-muted">{t('targetGone')}</span>
                    )}
                    <p className="text-xs text-muted">
                      {g.target?.author && `@${g.target.author} · `}
                      {g.target && t(`states.${g.target.state}`)} ·{' '}
                      {t('reportsCount', { count: g.count })}
                    </p>
                  </div>
                </div>
                <ul className="flex flex-col gap-1 rounded-xl bg-surface-2 p-3 text-sm">
                  {g.reports.map((r) => (
                    <li key={r.id}>
                      <b>{tr.has(r.reason) ? tr(r.reason as 'OTHER') : r.reason}</b>
                      {r.details && ` — “${r.details}”`}{' '}
                      <span className="text-muted">
                        (@{r.reporter}, {format.relativeTime(new Date(r.createdAt))})
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  {g.targetType !== 'USER' &&
                    (g.target?.state === 'HIDDEN' ? (
                      <Button size="sm" variant="outline" onClick={() => void decide(g, 'restore')}>
                        <RotateCcw className="size-4" /> {t('restore')}
                      </Button>
                    ) : (
                      <Button size="sm" variant="danger" onClick={() => void decide(g, 'hide')}>
                        <EyeOff className="size-4" /> {t('hide')}
                      </Button>
                    ))}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => confirm(t('banConfirm')) && void decide(g, 'ban')}
                  >
                    <Ban className="size-4" /> {t('banAuthor')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void decide(g, 'dismiss')}>
                    <X className="size-4" /> {t('dismiss')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ))}

      {tab === 'moderation' &&
        (!mod ? (
          <p className="text-muted">…</p>
        ) : mod.length === 0 ? (
          <p className="card p-8 text-center text-muted">✅ {t('noModeration')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {mod.map((m) => (
              <li key={m.id} className="card flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/quiz/${m.id}`}
                    target="_blank"
                    className="font-extrabold hover:underline"
                  >
                    {m.title}
                  </Link>
                  <p className="text-xs text-muted">
                    @{m.author} · {t(`states.${m.status}`)}
                    {m.hiddenReason && ` · ${t(`reasons.${m.hiddenReason}`)}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    void act(
                      () =>
                        apiFetch('/api/admin/quizzes', {
                          method: 'POST',
                          body: { quizId: m.id, action: 'approve' },
                        }),
                      'moderation',
                    )
                  }
                >
                  <Check className="size-4" /> {t('approve')}
                </Button>
                {m.status !== 'HIDDEN' && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() =>
                      void act(
                        () =>
                          apiFetch('/api/admin/quizzes', {
                            method: 'POST',
                            body: { quizId: m.id, action: 'hide' },
                          }),
                        'moderation',
                      )
                    }
                  >
                    <EyeOff className="size-4" /> {t('hide')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ))}

      {tab === 'users' && (
        <div className="flex flex-col gap-3">
          <form
            role="search"
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void load('users', q);
            }}
          >
            <label htmlFor="admin-user-q" className="sr-only">
              {t('searchUsers')}
            </label>
            <input
              id="admin-user-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('searchUsers')}
              className="h-11 min-w-0 flex-1 rounded-xl border-2 border-line bg-surface px-3 outline-none focus:border-accent"
            />
            <Button type="submit" variant="outline">
              <Search className="size-4" /> {t('search')}
            </Button>
          </form>
          {!users ? (
            <p className="text-muted">…</p>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs tracking-wider text-muted uppercase">
                  <tr>
                    <th className="px-3 py-2">{t('user')}</th>
                    <th className="px-3 py-2">{t('email')}</th>
                    <th className="px-3 py-2 text-right">{t('level')}</th>
                    <th className="px-3 py-2">{t('lastSeen')}</th>
                    <th className="px-3 py-2">
                      <span className="sr-only">{t('actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className={cn('border-t-2 border-line', u.banned && 'opacity-60')}
                    >
                      <td className="px-3 py-2">
                        <Link
                          href={`/perfil/${u.username}`}
                          target="_blank"
                          className="font-bold hover:underline"
                        >
                          {u.displayName}
                        </Link>{' '}
                        <span className="text-muted">@{u.username}</span>
                        {u.role === 'admin' && (
                          <span className="ml-1 rounded bg-accent/20 px-1.5 text-xs font-bold text-accent">
                            admin
                          </span>
                        )}
                        {u.banned && (
                          <span className="ml-1 rounded bg-danger/20 px-1.5 text-xs font-bold text-danger">
                            {t('banned')}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted">{u.email}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{u.level}</td>
                      <td className="px-3 py-2 text-muted">
                        {u.lastSeenAt ? format.relativeTime(new Date(u.lastSeenAt)) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {u.id !== me && (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant={u.banned ? 'outline' : 'ghost'}
                              disabled={u.role === 'admin'}
                              onClick={() =>
                                (u.banned ||
                                  confirm(t('banUserConfirm', { name: u.displayName }))) &&
                                void act(
                                  () =>
                                    apiFetch('/api/admin/users', {
                                      method: 'POST',
                                      body: { userId: u.id, banned: !u.banned },
                                    }),
                                  'users',
                                )
                              }
                            >
                              <Ban className="size-4" /> {u.banned ? t('unban') : t('ban')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              title={u.role === 'admin' ? t('removeAdmin') : t('makeAdmin')}
                              onClick={() =>
                                confirm(
                                  u.role === 'admin'
                                    ? t('removeAdminConfirm')
                                    : t('makeAdminConfirm'),
                                ) &&
                                void act(
                                  () =>
                                    apiFetch('/api/admin/users', {
                                      method: 'POST',
                                      body: {
                                        userId: u.id,
                                        role: u.role === 'admin' ? 'user' : 'admin',
                                      },
                                    }),
                                  'users',
                                )
                              }
                            >
                              <ShieldCheck className="size-4" />
                              <span className="sr-only">
                                {u.role === 'admin' ? t('removeAdmin') : t('makeAdmin')}
                              </span>
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'ai' &&
        (!ai ? (
          <p className="text-muted">…</p>
        ) : ai.length === 0 ? (
          <p className="card p-8 text-center text-muted">{t('noAi')}</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="px-3 pt-3 text-left text-muted">{t('aiCaption')}</caption>
              <thead className="text-xs tracking-wider text-muted uppercase">
                <tr>
                  <th className="px-3 py-2">{t('day')}</th>
                  <th className="px-3 py-2">{t('kind')}</th>
                  <th className="px-3 py-2 text-right">{t('requests')}</th>
                  <th className="px-3 py-2 text-right">{t('failed')}</th>
                  <th className="px-3 py-2 text-right">{t('tokens')}</th>
                </tr>
              </thead>
              <tbody>
                {ai.map((r) => (
                  <tr key={r.day + r.kind} className="border-t-2 border-line">
                    <td className="px-3 py-2">
                      {format.dateTime(new Date(r.day + 'T12:00:00'), { dateStyle: 'medium' })}
                    </td>
                    <td className="px-3 py-2">{t(`kinds.${r.kind}`)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.requests}</td>
                    <td
                      className={cn(
                        'px-3 py-2 text-right tabular-nums',
                        r.failed > 0 && 'text-danger',
                      )}
                    >
                      {r.failed}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{format.number(r.tokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
