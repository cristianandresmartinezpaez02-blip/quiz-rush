// "Jugar solo": todos los modos individuales en un solo lugar.
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { db } from '@quiz-rush/db';
import { readStoredStats } from '@quiz-rush/db/progress';
import { ADVENTURE_MAX_STARS } from '@quiz-rush/shared';
import { StartSoloButton } from '@/components/solo/start-solo-button';
import { Button } from '@/components/ui/button';
import { requirePageUser } from '@/lib/session';
import { adventureStars, dailyQuiz, reviewDueCount } from '@/lib/solo-content';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('solo');
  return { title: t('hubTitle') };
}

export default async function SoloHubPage() {
  const user = await requirePageUser('/solo');
  const t = await getTranslations('solo');
  const [profile, reviewDue, stars, daily] = await Promise.all([
    db.profile.findUnique({ where: { userId: user.id }, select: { stats: true } }),
    reviewDueCount(user.id),
    adventureStars(user.id),
    dailyQuiz().catch(() => null),
  ]);
  const dailyPlayed = daily
    ? !!(await db.player.findFirst({
        where: { userId: user.id, game: { soloKey: `daily:${daily.day}`, status: 'FINISHED' } },
        select: { id: true },
      }))
    : false;
  const rushBest = readStoredStats(profile?.stats).rushBest;
  const totalStars = Object.values(stars).reduce((a, b) => a + b, 0);

  const card = 'card flex flex-col gap-3 p-5';
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-4xl font-extrabold">⚡ {t('hubTitle')}</h1>
      <p className="mt-1 mb-6 text-muted">{t('hubSubtitle')}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <section className={`${card} border-[#a78bfa]`}>
          <p className="text-4xl" aria-hidden="true">
            ⚔️
          </p>
          <h2 className="text-2xl font-extrabold">{t('modes.DUEL.name')}</h2>
          <p className="flex-1 text-sm text-muted">{t('modes.DUEL.desc')}</p>
          <Button asChild size="lg">
            <Link href="/duelo">{t('play')}</Link>
          </Button>
        </section>
        <section className={card}>
          <p className="text-4xl" aria-hidden="true">
            ⚡
          </p>
          <h2 className="text-2xl font-extrabold">{t('modes.RUSH.name')}</h2>
          <p className="flex-1 text-sm text-muted">{t('modes.RUSH.desc')}</p>
          <p className="text-sm font-bold">{t('rushBest', { best: rushBest })}</p>
          <StartSoloButton input={{ mode: 'RUSH' }} size="lg">
            {t('play')}
          </StartSoloButton>
        </section>
        <section className={card}>
          <p className="text-4xl" aria-hidden="true">
            ☀️
          </p>
          <h2 className="text-2xl font-extrabold">{t('modes.DAILY.name')}</h2>
          <p className="flex-1 text-sm text-muted">
            {daily ? daily.quiz.title : t('modes.DAILY.desc')}
          </p>
          <Button asChild size="lg" variant={dailyPlayed ? 'outline' : 'primary'}>
            <Link href="/reto-diario">{dailyPlayed ? t('seeRanking') : t('play')}</Link>
          </Button>
        </section>
        <section className={card}>
          <p className="text-4xl" aria-hidden="true">
            🗺️
          </p>
          <h2 className="text-2xl font-extrabold">{t('modes.ADVENTURE.name')}</h2>
          <p className="flex-1 text-sm text-muted">{t('modes.ADVENTURE.desc')}</p>
          <p className="text-sm font-bold">
            ⭐ {totalStars} / {ADVENTURE_MAX_STARS}
          </p>
          <Button asChild size="lg">
            <Link href="/aventura">{t('play')}</Link>
          </Button>
        </section>
        <section className={card}>
          <p className="text-4xl" aria-hidden="true">
            🔁
          </p>
          <h2 className="text-2xl font-extrabold">{t('modes.REVIEW.name')}</h2>
          <p className="flex-1 text-sm text-muted">{t('modes.REVIEW.desc')}</p>
          <p className="text-sm font-bold">{t('reviewDue', { count: reviewDue })}</p>
          <StartSoloButton input={{ mode: 'REVIEW' }} size="lg" disabled={reviewDue === 0}>
            {t('play')}
          </StartSoloButton>
        </section>
        <section className={card}>
          <p className="text-4xl" aria-hidden="true">
            🎯
          </p>
          <h2 className="text-2xl font-extrabold">
            {t('modes.PRACTICE.name')} · {t('modes.CHALLENGE.name')}
          </h2>
          <p className="flex-1 text-sm text-muted">{t('practiceHowTo')}</p>
          <Button asChild size="lg" variant="outline">
            <Link href="/biblioteca">{t('toLibrary')}</Link>
          </Button>
        </section>
      </div>
    </div>
  );
}
