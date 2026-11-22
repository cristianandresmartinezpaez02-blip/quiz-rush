// Informe de una partida en vivo (solo quien la organizó).
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { QuestionStats } from '@/components/classes/question-stats';
import { buttonClass } from '@/components/ui/button-styles';
import { ApiError } from '@/lib/api';
import { gameReport } from '@/lib/class-service';
import { requirePageUser } from '@/lib/session';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('reports');
  return { title: t('gameTitle'), robots: { index: false } };
}

export default async function GameReportPage({ params }: Props) {
  const { id } = await params;
  const user = await requirePageUser(`/informes/partida/${id}`);
  const report = await gameReport(user.id, id).catch((err) => {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  });
  if (!report) notFound();
  const [t, tm, format] = await Promise.all([
    getTranslations('reports'),
    getTranslations('game.modes'),
    getFormatter(),
  ]);
  const avg = report.players.length
    ? Math.round(report.players.reduce((a, p) => a + p.percent, 0) / report.players.length)
    : null;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <Link href="/informes" className="text-sm font-bold text-muted underline">
            ← {t('title')}
          </Link>
          <h1 className="text-3xl font-extrabold">{report.quiz?.title ?? '—'}</h1>
          <p className="text-muted">
            {tm(`${report.mode}.name`)} · {t('players', { count: report.players.length })}
            {report.endedAt &&
              ` · ${format.dateTime(new Date(report.endedAt), { dateStyle: 'medium', timeStyle: 'short' })}`}
            {avg !== null && ` · ${t('averageIs', { percent: avg })}`}
          </p>
        </div>
        <a href={`/api/reports/games/${report.id}?format=xlsx`} className={buttonClass('outline')}>
          📊 {t('downloadXlsx')}
        </a>
        <a href={`/api/reports/games/${report.id}?format=csv`} className={buttonClass('ghost')}>
          {t('downloadCsv')}
        </a>
      </div>
      <section className="card p-5" aria-labelledby="ranking-title">
        <h2 id="ranking-title" className="mb-3 text-xl font-extrabold">
          {t('ranking')}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs tracking-wider text-muted uppercase">
              <tr>
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">{t('player')}</th>
                <th className="px-2 py-2 text-right">{t('score')}</th>
                <th className="px-2 py-2 text-right">{t('correct')}</th>
                <th className="px-2 py-2 text-right">{t('percent')}</th>
                <th className="px-2 py-2 text-right">{t('streak')}</th>
              </tr>
            </thead>
            <tbody>
              {report.players.map((p) => (
                <tr key={p.id} className="border-t-2 border-line">
                  <td className="px-2 py-2 font-black">{p.rank}</td>
                  <td className="px-2 py-2 font-bold">
                    {p.avatar} {p.nickname}
                    {p.team && (
                      <span
                        className="ml-2 rounded-full px-2 py-0.5 text-xs text-[#1a1640]"
                        style={{ background: p.team.color }}
                      >
                        {p.team.name}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{p.score.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{p.correctCount}</td>
                  <td className="px-2 py-2 text-right font-bold tabular-nums">{p.percent}%</td>
                  <td className="px-2 py-2 text-right tabular-nums">🔥 {p.bestStreak}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card p-5" aria-labelledby="questions-title">
        <h2 id="questions-title" className="mb-3 text-xl font-extrabold">
          {t('byQuestion')}
        </h2>
        <QuestionStats rows={report.questions} />
      </section>
    </div>
  );
}
