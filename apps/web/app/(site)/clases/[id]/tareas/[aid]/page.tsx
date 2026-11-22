// Informe de una tarea (solo profe): resumen, estudiantes y aciertos por pregunta.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { AvatarArt } from '@/components/avatar/avatar-art';
import { QuestionStats } from '@/components/classes/question-stats';
import { buttonClass } from '@/components/ui/button-styles';
import { ApiError } from '@/lib/api';
import { assignmentReport } from '@/lib/class-service';
import { requirePageUser } from '@/lib/session';

type Props = { params: Promise<{ id: string; aid: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('reports');
  return { title: t('assignmentTitle'), robots: { index: false } };
}

export default async function AssignmentReportPage({ params }: Props) {
  const { id, aid } = await params;
  const user = await requirePageUser(`/clases/${id}/tareas/${aid}`);
  const report = await assignmentReport(user.id, aid).catch((err) => {
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) return null;
    throw err;
  });
  if (!report) notFound();
  const [t, format] = await Promise.all([getTranslations('reports'), getFormatter()]);
  const s = report.summary;
  const stats = [
    { label: t('completed'), value: `${s.completed} / ${s.students}` },
    { label: t('average'), value: s.average === null ? '—' : `${s.average}%` },
    { label: t('passed'), value: `${s.passed} / ${s.students}` },
    { label: t('passingScore'), value: `${report.settings.passingScore}%` },
  ];
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <Link
            href={`/clases/${report.classId}`}
            className="text-sm font-bold text-muted underline"
          >
            ← {report.className}
          </Link>
          <h1 className="text-3xl font-extrabold">{report.title}</h1>
          <p className="text-muted">
            {report.quiz.title} ·{' '}
            {t('due', { date: format.dateTime(new Date(report.dueAt), { dateStyle: 'medium' }) })}
          </p>
        </div>
        <a
          href={`/api/assignments/${report.id}/report?format=xlsx`}
          className={buttonClass('outline')}
        >
          📊 {t('downloadXlsx')}
        </a>
        <a
          href={`/api/assignments/${report.id}/report?format=csv`}
          className={buttonClass('ghost')}
        >
          {t('downloadCsv')}
        </a>
      </div>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((x) => (
          <div key={x.label} className="card p-4">
            <dt className="text-xs font-black tracking-wider text-muted uppercase">{x.label}</dt>
            <dd className="font-display text-3xl font-black">{x.value}</dd>
          </div>
        ))}
      </dl>
      <section className="card p-5" aria-labelledby="students-title">
        <h2 id="students-title" className="mb-3 text-xl font-extrabold">
          {t('students')}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs tracking-wider text-muted uppercase">
              <tr>
                <th className="px-2 py-2">{t('student')}</th>
                <th className="px-2 py-2 text-right">{t('attempts')}</th>
                <th className="px-2 py-2 text-right">{t('bestPercent')}</th>
                <th className="px-2 py-2 text-right">{t('score')}</th>
                <th className="px-2 py-2">{t('status')}</th>
              </tr>
            </thead>
            <tbody>
              {report.students.map((st) => (
                <tr key={st.userId} className="border-t-2 border-line">
                  <td className="px-2 py-2">
                    <span className="flex items-center gap-2">
                      <AvatarArt config={st.avatar} size={28} />
                      <span className="font-bold">{st.displayName}</span>
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{st.attempts}</td>
                  <td className="px-2 py-2 text-right font-bold tabular-nums">
                    {st.best ? `${st.best.percent}%` : '—'}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {st.best ? st.best.score.toLocaleString() : '—'}
                  </td>
                  <td className="px-2 py-2">
                    {!st.best ? (
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold">
                        {t('pending')}
                      </span>
                    ) : st.passed ? (
                      <span className="rounded-full bg-success/20 px-2 py-0.5 text-xs font-bold text-success">
                        ✅ {t('passedLabel')}
                      </span>
                    ) : (
                      <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs font-bold text-danger">
                        {t('failedLabel')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {report.students.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-muted">
                    {t('noStudents')}
                  </td>
                </tr>
              )}
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
