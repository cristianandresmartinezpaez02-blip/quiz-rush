// Reto diario: el mismo quiz para todos hoy, un intento, y el ranking del día.
import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import { db } from '@quiz-rush/db';
import { LeaderboardList } from '@/components/solo/leaderboard-list';
import { StartSoloButton } from '@/components/solo/start-solo-button';
import { requirePageUser } from '@/lib/session';
import { dailyQuiz } from '@/lib/solo-content';
import { soloLeaderboard } from '@/lib/solo-service';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('solo');
  return { title: t('modes.DAILY.name') };
}

export default async function DailyPage() {
  const user = await requirePageUser('/reto-diario');
  const [t, format] = await Promise.all([getTranslations('solo'), getFormatter()]);
  const daily = await dailyQuiz().catch(() => null);
  if (!daily) {
    return <p className="mx-auto max-w-xl px-4 py-16 text-center text-muted">{t('noDaily')}</p>;
  }
  const soloKey = `daily:${daily.day}`;
  const [played, leaderboard] = await Promise.all([
    db.player.findFirst({
      where: { userId: user.id, game: { soloKey, status: 'FINISHED' } },
      select: { score: true, correctCount: true },
    }),
    soloLeaderboard(soloKey, 30),
  ]);
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-2">
      <section className="card flex flex-col gap-4 p-6">
        <p className="text-sm font-black tracking-widest text-muted uppercase">
          ☀️ {format.dateTime(new Date(`${daily.day}T12:00:00Z`), { dateStyle: 'full' })}
        </p>
        <h1 className="text-3xl font-extrabold">{daily.quiz.title}</h1>
        <p className="text-muted">{t('dailyHelp')}</p>
        {played ? (
          <p className="rounded-2xl bg-primary/20 px-4 py-3 font-bold">
            ✅ {t('dailyDone', { score: played.score.toLocaleString() })}
          </p>
        ) : (
          <StartSoloButton input={{ mode: 'DAILY' }} size="lg">
            {t('play')}
          </StartSoloButton>
        )}
      </section>
      <section className="card p-6" aria-labelledby="daily-ranking">
        <h2 id="daily-ranking" className="mb-3 text-xl font-extrabold">
          🏆 {t('todayRanking')}
        </h2>
        <LeaderboardList rows={leaderboard} meId={user.id} />
      </section>
    </div>
  );
}
