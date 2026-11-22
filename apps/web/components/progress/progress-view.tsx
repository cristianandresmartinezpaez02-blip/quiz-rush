'use client';
// Panel de progreso: nivel y rango, racha, misiones (cobrar), liga semanal, pase de temporada,
// logros y acceso al repaso.
import { motion } from 'motion/react';
import { Check, Lock, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { RANK_EMOJI, type RankId } from '@quiz-rush/shared';
import { AvatarArt } from '@/components/avatar/avatar-art';
import { Button } from '@/components/ui/button';
import { apiFetch, startSoloGame } from '@/lib/client-api';
import { burstConfetti } from '@/lib/game/effects';
import type { ProgressData } from '@/lib/progress-service';
import { cn } from '@/lib/utils';

export function ProgressView({ initial, avatar }: { initial: ProgressData; avatar: unknown }) {
  const t = useTranslations('progress');
  const te = useTranslations('errors');
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const errorText = (code: string) => (te.has(code) ? te(code as 'INTERNAL') : te('INTERNAL'));

  async function refresh() {
    setData(await apiFetch<ProgressData>('/api/progress'));
    router.refresh(); // cabecera (nivel y monedas)
  }

  async function claim(kind: 'mission' | 'season', id: string) {
    setBusy(id);
    try {
      const url =
        kind === 'mission'
          ? `/api/progress/missions/${id}/claim`
          : `/api/progress/season/${id}/claim`;
      const res = await apiFetch<{
        xp?: number;
        coins?: number;
        outcome?: { xp: number; coins: number };
      }>(url, {
        method: 'POST',
      });
      const o = res.outcome ?? res;
      toast.success(t('claimed', { xp: o.xp ?? 0, coins: o.coins ?? 0 }));
      burstConfetti(0.7);
      await refresh();
    } catch (err) {
      toast.error(errorText((err as Error).message));
    } finally {
      setBusy(null);
    }
  }

  async function startReview() {
    setBusy('review');
    try {
      router.push(`/solo/${await startSoloGame({ mode: 'REVIEW' })}`);
    } catch (err) {
      toast.error(errorText((err as Error).message));
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <Hero data={data} avatar={avatar} />
        {data.reviewDue > 0 && (
          <div className="card flex flex-wrap items-center gap-3 p-4">
            <span className="text-3xl" aria-hidden="true">
              🔁
            </span>
            <p className="flex-1 font-bold">{t('reviewDue', { count: data.reviewDue })}</p>
            <Button onClick={startReview} loading={busy === 'review'}>
              <RotateCcw className="size-4" /> {t('reviewNow')}
            </Button>
          </div>
        )}
        <Missions data={data} busy={busy} onClaim={(id) => claim('mission', id)} />
        <Season data={data} busy={busy} onClaim={(tier) => claim('season', String(tier))} />
        <Achievements data={data} />
      </div>
      <aside className="flex flex-col gap-6">
        <League data={data} />
      </aside>
    </div>
  );
}

function Hero({ data, avatar }: { data: ProgressData; avatar: unknown }) {
  const t = useTranslations('progress');
  const ranks = useTranslations('ranks');
  const format = useFormatter();
  const p = data.profile;
  const stats = [
    { label: t('stats.games'), value: data.stats.games, icon: '🎮' },
    { label: t('stats.correct'), value: data.stats.correct, icon: '✅' },
    { label: t('stats.wins'), value: data.stats.wins, icon: '🥇' },
    { label: t('stats.bestStreak'), value: data.stats.bestStreak, icon: '🔥' },
  ];
  return (
    <section className="card relative overflow-hidden p-5 sm:p-6" aria-label={t('levelTitle')}>
      <div className="flex flex-wrap items-center gap-5">
        <Link
          href="/tienda"
          aria-label={t('editAvatar')}
          className="rounded-full transition hover:scale-105"
        >
          <AvatarArt config={avatar} size={112} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-muted">
            {RANK_EMOJI[p.rank as RankId]} {ranks(p.rank)}
          </p>
          <h1 className="truncate font-display text-3xl font-black">{p.displayName}</h1>
          <div className="mt-2 flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary font-display text-xl font-black text-primary-ink">
              {p.level}
            </span>
            <div className="min-w-0 flex-1">
              <div
                className="h-4 overflow-hidden rounded-full bg-surface-2"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={p.needed}
                aria-valuenow={p.current}
                aria-label={t('xpToNext')}
              >
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-accent to-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${p.ratio * 100}%` }}
                  transition={{ type: 'spring', stiffness: 60, damping: 16 }}
                />
              </div>
              <p className="mt-1 text-xs font-bold text-muted">
                {t('xpProgress', {
                  current: format.number(p.current),
                  needed: format.number(p.needed),
                  level: p.level + 1,
                })}
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="rounded-2xl bg-surface-2 px-4 py-3 text-center">
            <p className="font-display text-2xl font-black">🪙 {format.number(p.coins)}</p>
            <p className="text-xs font-bold text-muted">{t('coins')}</p>
          </div>
          <div className="rounded-2xl bg-surface-2 px-4 py-3 text-center">
            <p className="font-display text-2xl font-black">🔥 {p.dailyStreak}</p>
            <p className="text-xs font-bold text-muted">
              {p.playedToday ? t('streakToday') : t('streakKeep')}
            </p>
          </div>
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-surface-2 px-3 py-2">
            <dt className="text-xs font-bold text-muted">
              {s.icon} {s.label}
            </dt>
            <dd className="font-display text-xl font-black">{format.number(s.value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Missions({
  data,
  busy,
  onClaim,
}: {
  data: ProgressData;
  busy: string | null;
  onClaim: (id: string) => void;
}) {
  const t = useTranslations('progress');
  const tm = useTranslations('missions');
  const groups = (['DAILY', 'WEEKLY'] as const).map((period) => ({
    period,
    items: data.missions.filter((m) => m.period === period),
  }));
  return (
    <section className="card p-5" aria-labelledby="missions-title">
      <h2 id="missions-title" className="mb-3 text-xl font-extrabold">
        🎯 {t('missionsTitle')}
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((g) => (
          <div key={g.period}>
            <p className="mb-2 text-xs font-black tracking-wider text-muted uppercase">
              {g.period === 'DAILY' ? t('daily') : t('weekly')}
            </p>
            <ul className="flex flex-col gap-2">
              {g.items.map((m) => (
                <li key={m.code} className="rounded-2xl border-2 border-line p-3">
                  <div className="flex items-start gap-2">
                    <p className="flex-1 text-sm font-bold">{tm(m.code)}</p>
                    <span className="shrink-0 text-xs font-bold text-muted">
                      +{m.rewardXp} XP · 🪙{m.rewardCoins}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          m.completed ? 'bg-success' : 'bg-accent',
                        )}
                        style={{ width: `${Math.min(100, (m.progress / m.target) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold tabular-nums">
                      {Math.min(m.progress, m.target)}/{m.target}
                    </span>
                    {m.claimed ? (
                      <span className="flex items-center gap-1 text-xs font-bold text-success">
                        <Check className="size-4" /> {t('claimedShort')}
                      </span>
                    ) : m.completed && m.id ? (
                      <Button size="sm" onClick={() => onClaim(m.id!)} loading={busy === m.id}>
                        {t('claim')}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function League({ data }: { data: ProgressData }) {
  const t = useTranslations('progress');
  const ranks = useTranslations('ranks');
  const l = data.league;
  return (
    <section className="card p-5" aria-labelledby="league-title">
      <h2 id="league-title" className="text-xl font-extrabold">
        🏆 {t('leagueTitle')}
      </h2>
      {data.lastLeague && (
        <p className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-xs font-bold">
          {t(`lastLeague.${data.lastLeague.result ?? 'STAYED'}`, {
            position: data.lastLeague.finalPosition ?? 0,
            tier: ranks(data.lastLeague.league.tier),
          })}
        </p>
      )}
      {!l ? (
        <p className="mt-3 text-sm text-muted">{t('leagueEmpty')}</p>
      ) : (
        <>
          <p className="mt-1 mb-3 text-sm font-bold text-muted">
            {RANK_EMOJI[l.tier as RankId]} {t('division', { tier: ranks(l.tier) })} ·{' '}
            {t('leagueRules', { up: l.promote, down: l.demote })}
          </p>
          <ol className="flex flex-col gap-1">
            {l.members.map((m) => {
              const up = l.tier !== 'LEGEND' && m.position <= l.promote && m.weeklyXp > 0;
              const down =
                l.tier !== 'BRONZE' &&
                m.position >
                  l.members.length - Math.min(l.demote, Math.floor(l.members.length / 2));
              return (
                <li
                  key={m.userId}
                  className={cn(
                    'flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm',
                    m.me && 'bg-primary/20 font-extrabold ring-2 ring-primary',
                    !m.me && up && 'bg-success/10',
                    !m.me && down && 'bg-danger/10',
                  )}
                >
                  <span className="w-6 text-right font-black tabular-nums">{m.position}</span>
                  <AvatarArt config={m.avatar} size={28} />
                  <span className="min-w-0 flex-1 truncate">{m.displayName}</span>
                  <span className="font-bold tabular-nums">{m.weeklyXp} XP</span>
                  {up && <span aria-label={t('promoting')}>⬆️</span>}
                  {down && <span aria-label={t('relegating')}>⬇️</span>}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}

function Season({
  data,
  busy,
  onClaim,
}: {
  data: ProgressData;
  busy: string | null;
  onClaim: (tier: number) => void;
}) {
  const t = useTranslations('progress');
  const format = useFormatter();
  const s = data.season;
  if (!s) return null;
  const nextTierAt = (s.tier + 1) * s.tierPoints;
  return (
    <section className="card p-5" aria-labelledby="season-title">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 id="season-title" className="text-xl font-extrabold">
          🎟️ {t('seasonTitle', { number: s.number })}
        </h2>
        <p className="text-sm text-muted">
          {t('seasonEnds', { date: format.dateTime(new Date(s.endsAt), { dateStyle: 'medium' }) })}
        </p>
      </div>
      <p className="mt-1 text-sm font-bold">
        {t('seasonProgress', { tier: s.tier, tiers: s.tiers })}
        {s.tier < s.tiers &&
          ` · ${t('seasonNext', { points: format.number(nextTierAt - s.points) })}`}
      </p>
      <ol className="mt-3 flex snap-x gap-2 overflow-x-auto pb-2">
        {s.rewards.map((r) => {
          const reached = r.tier <= s.tier;
          const claimed = s.claimed.includes(r.tier);
          return (
            <li
              key={r.tier}
              className={cn(
                'flex w-24 shrink-0 snap-start flex-col items-center gap-1 rounded-2xl border-2 p-2 text-center',
                reached ? 'border-primary bg-primary/10' : 'border-line opacity-70',
              )}
            >
              <span className="text-xs font-black text-muted">{r.tier}</span>
              <span className="text-2xl" aria-hidden="true">
                {r.kind === 'coins' ? '🪙' : '🎁'}
              </span>
              <span className="text-xs font-bold">
                {r.kind === 'coins' ? `${r.amount}` : t('seasonItem')}
              </span>
              {claimed ? (
                <Check className="size-5 text-success" aria-label={t('claimedShort')} />
              ) : reached ? (
                <Button size="sm" onClick={() => onClaim(r.tier)} loading={busy === String(r.tier)}>
                  {t('claim')}
                </Button>
              ) : (
                <Lock className="size-4 text-muted" aria-label={t('locked')} />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Achievements({ data }: { data: ProgressData }) {
  const t = useTranslations('progress');
  const ta = useTranslations('achievements');
  const unlocked = data.achievements.filter((a) => a.unlockedAt).length;
  const categories = [...new Set(data.achievements.map((a) => a.category))];
  return (
    <section className="card p-5" aria-labelledby="achievements-title">
      <h2 id="achievements-title" className="text-xl font-extrabold">
        🏅 {t('achievementsTitle', { unlocked, total: data.achievements.length })}
      </h2>
      {categories.map((cat) => (
        <div key={cat} className="mt-4">
          <p className="mb-2 text-xs font-black tracking-wider text-muted uppercase">
            {t(`categories.${cat}`)}
          </p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {data.achievements
              .filter((a) => a.category === cat)
              .map((a) => (
                <li
                  key={a.code}
                  className={cn(
                    'flex flex-col gap-1 rounded-2xl border-2 p-3',
                    a.unlockedAt ? 'border-primary bg-primary/10' : 'border-line',
                  )}
                  title={a.secret ? t('secret') : ta(`${a.code}.desc`)}
                >
                  <span
                    className={cn('text-3xl', !a.unlockedAt && 'opacity-40 grayscale')}
                    aria-hidden="true"
                  >
                    {a.secret ? '❓' : a.icon}
                  </span>
                  <span className="text-sm font-extrabold">
                    {a.secret ? '???' : ta(`${a.code}.name`)}
                  </span>
                  <span className="text-xs text-muted">
                    {a.secret ? t('secret') : ta(`${a.code}.desc`)}
                  </span>
                  {!a.unlockedAt && !a.secret && (
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${a.progress * 100}%` }}
                      />
                    </div>
                  )}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
