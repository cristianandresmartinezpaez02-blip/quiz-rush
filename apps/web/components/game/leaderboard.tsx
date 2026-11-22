'use client';
// Ranking animado: primero se muestra el orden anterior y, tras un instante, los jugadores
// suben y bajan a su nuevo puesto (animación de "layout").
import { motion } from 'motion/react';
import { ArrowDown, ArrowUp, Flame } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { LeaderboardEntry } from '@quiz-rush/shared';
import { cn } from '@/lib/utils';

export function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  const t = useTranslations('game');
  const format = useFormatter();
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setSettled(true), 900);
    return () => clearTimeout(id);
  }, [entries]);

  // Orden anterior (los nuevos o sin puesto previo, al final) → orden nuevo
  const ordered = settled
    ? entries
    : [...entries].sort((a, b) => (a.prevRank ?? 999) - (b.prevRank ?? 999));

  return (
    <ol className="mx-auto flex w-full max-w-3xl flex-col gap-2.5" aria-label={t('leaderboard')}>
      {ordered.map((e) => {
        const delta = e.prevRank !== null ? e.prevRank - e.rank : 0;
        return (
          <motion.li
            key={e.id}
            layout
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className={cn(
              'flex items-center gap-4 rounded-2xl px-5 py-3 text-white shadow-lg',
              e.rank === 1
                ? 'bg-gradient-to-r from-[#ffb020] to-[#ffe14d] text-[#1a1640]'
                : 'bg-white/12 backdrop-blur',
            )}
          >
            <span className="w-10 text-center font-display text-3xl font-extrabold">
              {settled ? e.rank : (e.prevRank ?? '–')}
            </span>
            <span className="text-4xl" aria-hidden="true">
              {e.avatar}
            </span>
            <span className="min-w-0 flex-1 truncate font-display text-2xl font-extrabold">
              {e.nick}
            </span>
            {e.streak >= 2 && (
              <span className="flex items-center gap-1 rounded-full bg-[#ff3d9a] px-2.5 py-1 text-sm font-extrabold text-white">
                <Flame className="size-4" /> {e.streak}
              </span>
            )}
            {settled && delta !== 0 && (
              <motion.span
                initial={{ opacity: 0, y: delta > 0 ? 8 : -8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'flex items-center text-sm font-extrabold',
                  delta > 0 ? 'text-[#3ddc84]' : 'text-[#ff6369]',
                )}
                aria-label={
                  delta > 0 ? t('rankUp', { count: delta }) : t('rankDown', { count: -delta })
                }
              >
                {delta > 0 ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
                {Math.abs(delta)}
              </motion.span>
            )}
            <span className="font-display text-2xl font-extrabold tabular-nums">
              {format.number(e.score)}
            </span>
          </motion.li>
        );
      })}
    </ol>
  );
}
