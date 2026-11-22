// Perfil público del creador: datos, seguir, estadísticas, quizzes publicados y colecciones públicas.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { cache } from 'react';
import { dbRead } from '@quiz-rush/db';
import { ACHIEVEMENTS, RANK_EMOJI, type RankId } from '@quiz-rush/shared';
import { AvatarArt } from '@/components/avatar/avatar-art';
import { QuizCard } from '@/components/library/quiz-card';
import { FollowButton } from '@/components/social/follow-button';
import { FriendButton } from '@/components/social/friend-button';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { cached } from '@/lib/cache';
import { isFollowing } from '@/lib/community-service';
import { cardsByIds } from '@/lib/library-service';
import { getCurrentUser } from '@/lib/session';
import { friendStatus } from '@/lib/social-service';

const getProfile = cache(async (username: string) =>
  dbRead.profile.findUnique({
    where: { username: username.toLowerCase() },
    include: {
      user: {
        select: {
          createdAt: true,
          isAnonymous: true,
          avatar: { select: { config: true } },
          // Logros más recientes para la vitrina del perfil
          achievements: {
            orderBy: { unlockedAt: 'desc' },
            take: 8,
            select: { achievement: { select: { code: true } } },
          },
          _count: { select: { achievements: true } },
        },
      },
    },
  }),
);

/** Estadísticas del creador (cacheadas 2 min): jugadas totales y nota media de sus quizzes. */
const getCreatorStats = (userId: string) =>
  cached(`profile:stats:${userId}`, 120, async () => {
    const agg = await dbRead.quiz.aggregate({
      where: { authorId: userId, status: 'PUBLISHED', deletedAt: null },
      _sum: { playCount: true, ratingSum: true, ratingCount: true },
    });
    const ratingCount = agg._sum.ratingCount ?? 0;
    return {
      plays: agg._sum.playCount ?? 0,
      avgRating: ratingCount ? (agg._sum.ratingSum ?? 0) / ratingCount : null,
    };
  });

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await getProfile((await params).username);
  if (!profile) return {};
  return {
    title: `${profile.displayName} (@${profile.username})`,
    description: profile.bio ?? undefined,
  };
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export default async function ProfilePage({ params }: Props) {
  const { username } = await params;
  const profile = await getProfile(username);
  if (!profile || profile.user.isAnonymous) notFound();

  const me = await getCurrentUser();
  const [t, ta, format, quizIds, collections, stats, following, friendship] = await Promise.all([
    getTranslations('profile'),
    getTranslations('achievements'),
    getFormatter(),
    dbRead.quiz.findMany({
      where: {
        authorId: profile.userId,
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        deletedAt: null,
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: 48,
      select: { id: true },
    }),
    dbRead.collection.findMany({
      where: { ownerId: profile.userId, isPublic: true },
      orderBy: { updatedAt: 'desc' },
      take: 12,
      select: { id: true, name: true, _count: { select: { items: true } } },
    }),
    getCreatorStats(profile.userId),
    me ? isFollowing(me.id, profile.userId) : Promise.resolve(false),
    me && !me.isAnonymous ? friendStatus(me.id, profile.userId) : Promise.resolve('none' as const),
  ]);
  const quizzes = await cardsByIds(quizIds.map((q) => q.id));

  const isMe = me?.id === profile.userId;
  const viewer = me ? { id: me.id, isGuest: me.isAnonymous } : null;
  const accuracy = profile.totalAnswered
    ? Math.round((profile.totalCorrect / profile.totalAnswered) * 100)
    : null;
  const statItems = [
    { label: t('quizzes'), value: profile.quizzesCount },
    {
      label: t('followers'),
      value: format.number(profile.followersCount, { notation: 'compact' }),
    },
    { label: t('following'), value: profile.followingCount },
    { label: t('totalPlays'), value: format.number(stats.plays, { notation: 'compact' }) },
    {
      label: t('avgRating'),
      value: stats.avgRating
        ? `★ ${format.number(stats.avgRating, { maximumFractionDigits: 1 })}`
        : '—',
    },
    { label: t('accuracy'), value: accuracy === null ? '—' : `${accuracy}%` },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <section className="card relative overflow-hidden p-6 md:p-8">
        <div
          className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-accent/30 to-primary/20"
          aria-hidden="true"
        />
        <div className="relative flex flex-col items-center gap-5 pt-6 text-center md:flex-row md:items-end md:text-left">
          {profile.user.avatar ? (
            <AvatarArt config={profile.user.avatar.config} size={120} title={profile.displayName} />
          ) : (
            <div className="grid size-28 shrink-0 place-items-center rounded-[2rem] bg-gradient-to-br from-accent to-primary font-display text-4xl font-extrabold text-primary-ink shadow-[0_6px_0_0_var(--line)] ring-4 ring-[var(--surface)]">
              {initials(profile.displayName)}
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-3xl font-extrabold md:text-4xl">{profile.displayName}</h1>
            <p className="text-muted">@{profile.username}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2 md:justify-start">
              <span className="rounded-full bg-primary px-3 py-1 text-xs font-extrabold text-primary-ink">
                {t('level', { level: profile.level })}
              </span>
              <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-bold">
                {RANK_EMOJI[profile.rank as RankId]} {t(`ranks.${profile.rank}`)}
              </span>
              {profile.dailyStreak > 0 && (
                <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-bold text-accent">
                  🔥 {profile.dailyStreak}
                </span>
              )}
            </div>
            {profile.bio && <p className="mt-3 max-w-2xl">{profile.bio}</p>}
            <p className="mt-2 text-xs text-muted">
              {t('memberSince', {
                date: format.dateTime(profile.user.createdAt, { month: 'long', year: 'numeric' }),
              })}
            </p>
          </div>
          {isMe ? (
            <Button asChild variant="outline">
              <Link href="/ajustes">{t('editProfile')}</Link>
            </Button>
          ) : (
            <div className="flex flex-wrap justify-center gap-2">
              <FollowButton
                userId={profile.userId}
                initialFollowing={following}
                viewer={viewer}
                size="md"
              />
              <FriendButton
                userId={profile.userId}
                username={profile.username}
                initialStatus={friendship}
                viewer={viewer}
              />
            </div>
          )}
        </div>
        {profile.user.achievements.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-xs font-black tracking-wider text-muted uppercase">
              {t('achievements', {
                count: profile.user._count.achievements,
                total: ACHIEVEMENTS.length,
              })}
            </p>
            <ul className="flex flex-wrap gap-2">
              {profile.user.achievements.map(({ achievement }) => (
                <li
                  key={achievement.code}
                  className="grid size-12 place-items-center rounded-2xl bg-surface-2 text-2xl"
                  title={ta(`${achievement.code}.name`)}
                >
                  <span aria-hidden="true">
                    {ACHIEVEMENTS.find((x) => x.code === achievement.code)?.icon ?? '🏅'}
                  </span>
                  <span className="sr-only">{ta(`${achievement.code}.name`)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <dl className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {statItems.map((s) => (
            <div key={s.label} className="rounded-2xl bg-surface-2 p-3 text-center">
              <dt className="text-[11px] font-bold text-muted uppercase">{s.label}</dt>
              <dd className="font-display text-xl font-extrabold">{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-10" aria-labelledby="quizzes-title">
        <h2 id="quizzes-title" className="mb-4 text-2xl font-extrabold">
          {t('publishedQuizzes')}
        </h2>
        {quizzes.length === 0 ? (
          <EmptyState emoji="🌱" title={t('noQuizzes')} />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {quizzes.map((q) => (
              <QuizCard key={q.id} quiz={q} />
            ))}
          </div>
        )}
      </section>

      {collections.length > 0 && (
        <section className="mt-10" aria-labelledby="collections-title">
          <h2 id="collections-title" className="mb-4 text-2xl font-extrabold">
            📁 {t('publicCollections')}
          </h2>
          <ul className="flex flex-wrap gap-3">
            {collections.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/coleccion/${c.id}`}
                  className="card block px-4 py-3 font-bold hover:border-accent"
                >
                  {c.name} <span className="text-sm text-muted">· {c._count.items}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
