// Informes: partidas en vivo que organicé.
import type { Metadata } from 'next';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { MODE_EMOJI, type LiveMode } from '@quiz-rush/shared';
import { EmptyState } from '@/components/ui/empty-state';
import { listHostedGames } from '@/lib/class-service';
import { requirePageUser } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('reports');
  return { title: t('title') };
}

export default async function ReportsPage() {
  const user = await requirePageUser('/informes');
  const [t, format, games] = await Promise.all([
    getTranslations('reports'),
    getFormatter(),
    listHostedGames(user.id),
  ]);
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-4xl font-extrabold">📊 {t('title')}</h1>
      <p className="mt-1 mb-6 text-muted">{t('subtitle')}</p>
      {games.length === 0 ? (
        <EmptyState emoji="🎮" title={t('emptyTitle')} text={t('emptyText')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {games.map((g) => (
            <li key={g.id}>
              <Link
                href={`/informes/partida/${g.id}`}
                className="card flex flex-wrap items-center gap-3 p-4 hover:border-accent/60"
              >
                <span className="text-2xl" aria-hidden="true">
                  {MODE_EMOJI[g.mode as LiveMode] ?? '⚡'}
                </span>
                <span className="min-w-0 flex-1 font-bold">{g.quiz?.title ?? '—'}</span>
                <span className="text-sm text-muted">{t('players', { count: g.playerCount })}</span>
                <span className="text-sm text-muted">
                  {g.endedAt
                    ? format.dateTime(g.endedAt, { dateStyle: 'medium', timeStyle: 'short' })
                    : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
