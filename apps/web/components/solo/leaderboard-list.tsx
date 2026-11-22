// Ranking de una partida individual (reto diario, desafío o Rush del día).
import { useTranslations } from 'next-intl';
import { AvatarArt } from '@/components/avatar/avatar-art';
import { cn } from '@/lib/utils';

export interface LeaderboardRow {
  userId: string;
  position: number;
  score: number;
  correct: number;
  username: string;
  displayName: string;
  avatar: unknown;
}

export function LeaderboardList({
  rows,
  meId,
  unit,
}: {
  rows: LeaderboardRow[];
  meId?: string | null;
  /** Rush: puntos = aciertos */
  unit?: 'points' | 'correct';
}) {
  const t = useTranslations('solo');
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted">{t('noRanking')}</p>;
  return (
    <ol className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li
          key={r.userId}
          className={cn(
            'flex items-center gap-3 rounded-2xl px-3 py-2',
            r.userId === meId ? 'bg-primary/20 font-extrabold ring-2 ring-primary' : 'bg-surface-2',
          )}
        >
          <span className="w-7 text-center font-display text-lg font-black">
            {['🥇', '🥈', '🥉'][r.position - 1] ?? r.position}
          </span>
          <AvatarArt config={r.avatar} size={32} />
          <span className="min-w-0 flex-1 truncate">{r.displayName}</span>
          <span className="font-display font-black tabular-nums">
            {unit === 'correct' ? `⚡ ${r.score}` : r.score.toLocaleString()}
          </span>
        </li>
      ))}
    </ol>
  );
}
