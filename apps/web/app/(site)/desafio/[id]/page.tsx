// Desafío por enlace: cualquiera con el enlace lo juega una vez; ranking de quienes lo jugaron.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { db } from '@quiz-rush/db';
import { LeaderboardList } from '@/components/solo/leaderboard-list';
import { StartSoloButton } from '@/components/solo/start-solo-button';
import { CopyLink } from '@/components/solo/copy-link';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { getCurrentUser } from '@/lib/session';
import { challengeInfo } from '@/lib/solo-content';
import { soloLeaderboard } from '@/lib/solo-service';

type Props = { params: Promise<{ id: string }> };

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

async function load(id: string) {
  const ch = await challengeInfo(id).catch((err) => {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  });
  return ch && { ...ch, ended: !!ch.endsAt && ch.endsAt.getTime() < Date.now() };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [t, ch] = await Promise.all([getTranslations('solo'), load((await params).id)]);
  if (!ch?.quiz) return {};
  return {
    title: t('challengeTitle', { quiz: ch.quiz.title }),
    description: t('challengeShare', { name: ch.host?.profile?.displayName ?? 'Quiz_Rush' }),
  };
}

export default async function ChallengePage({ params }: Props) {
  const { id } = await params;
  const [t, format, ch, user] = await Promise.all([
    getTranslations('solo'),
    getFormatter(),
    load(id),
    getCurrentUser(),
  ]);
  if (!ch?.quiz) notFound();
  const soloKey = `challenge:${ch.id}`;
  const [leaderboard, played] = await Promise.all([
    soloLeaderboard(soloKey, 50),
    user
      ? db.player.findFirst({
          where: { userId: user.id, game: { soloKey, status: 'FINISHED' } },
          select: { score: true },
        })
      : null,
  ]);
  const ended = ch.ended;
  const count = (ch.quizSnapshot as { questions?: unknown[] }).questions?.length ?? 0;
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-2">
      <section className="card flex flex-col gap-4 p-6">
        <p className="text-sm font-black tracking-widest text-muted uppercase">
          🎯 {t('challenge')}
        </p>
        <h1 className="text-3xl font-extrabold">{ch.quiz.title}</h1>
        <p className="text-muted">
          {t('challengeBy', { name: ch.host?.profile?.displayName ?? '—' })} ·{' '}
          {t('questionsCount', { count })}
        </p>
        {ch.endsAt && (
          <p className="font-bold">
            ⏳{' '}
            {ended
              ? t('challengeEnded')
              : t('challengeEnds', { date: format.relativeTime(ch.endsAt) })}
          </p>
        )}
        {played ? (
          <p className="rounded-2xl bg-primary/20 px-4 py-3 font-bold">
            ✅ {t('challengeDone', { score: played.score.toLocaleString() })}
          </p>
        ) : ended ? null : user ? (
          <StartSoloButton input={{ mode: 'CHALLENGE', challengeId: ch.id }} size="lg">
            {t('acceptChallenge')}
          </StartSoloButton>
        ) : (
          <Button asChild size="lg">
            <Link href={`/entrar?volver=${encodeURIComponent(`/desafio/${ch.id}`)}`}>
              {t('signInToPlay')}
            </Link>
          </Button>
        )}
        <CopyLink url={`${appUrl}/desafio/${ch.id}`} />
      </section>
      <section className="card p-6" aria-labelledby="challenge-ranking">
        <h2 id="challenge-ranking" className="mb-3 text-xl font-extrabold">
          🏆 {t('ranking')}
        </h2>
        <LeaderboardList rows={leaderboard} meId={user?.id} />
      </section>
    </div>
  );
}
