// Tabla de aciertos por pregunta (informes de tareas y de partidas): las difíciles saltan a la vista.
import { useTranslations } from 'next-intl';
import { QUESTION_TYPE_EMOJI, type QuestionType } from '@quiz-rush/shared';
import { cn } from '@/lib/utils';

export interface QuestionStatRow {
  id: string;
  prompt: string;
  type: string;
  answered: number;
  accuracy: number;
  avgMs: number;
}

export function QuestionStats({ rows }: { rows: QuestionStatRow[] }) {
  const t = useTranslations('reports');
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs tracking-wider text-muted uppercase">
          <tr>
            <th className="px-2 py-2">#</th>
            <th className="px-2 py-2">{t('question')}</th>
            <th className="px-2 py-2 text-right">{t('answers')}</th>
            <th className="w-48 px-2 py-2">{t('accuracy')}</th>
            <th className="px-2 py-2 text-right">{t('avgTime')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((q, i) => (
            <tr key={q.id} className="border-t-2 border-line">
              <td className="px-2 py-2 font-bold">{i + 1}</td>
              <td className="px-2 py-2">
                <span aria-hidden="true">
                  {QUESTION_TYPE_EMOJI[q.type as QuestionType] ?? '❓'}
                </span>{' '}
                {q.prompt}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{q.answered}</td>
              <td className="px-2 py-2">
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2"
                    aria-hidden="true"
                  >
                    <div
                      className={cn(
                        'h-full rounded-full',
                        q.accuracy >= 70
                          ? 'bg-success'
                          : q.accuracy >= 40
                            ? 'bg-[#fb923c]'
                            : 'bg-danger',
                      )}
                      style={{ width: `${q.accuracy}%` }}
                    />
                  </div>
                  <span className="w-10 text-right font-bold tabular-nums">
                    {q.answered ? `${q.accuracy}%` : '—'}
                  </span>
                </div>
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {q.answered ? `${(q.avgMs / 1000).toFixed(1)} s` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
