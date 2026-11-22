'use client';
// Podio final: los tres primeros suben en sus pedestales, con fuegos artificiales y la
// "repetición" de los momentos destacados de la partida.
import { motion } from 'motion/react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect } from 'react';
import type { Highlight, PodiumData } from '@quiz-rush/shared';
import { fireworks, sideCannons } from '@/lib/game/effects';
import { playSfx } from '@/lib/game/sounds';
import { cn } from '@/lib/utils';

const PLACES = [
  {
    place: 2,
    height: 'h-40 md:h-52',
    color: 'from-[#c0c8d8] to-[#8e99ad]',
    delay: 0.9,
    medal: '🥈',
  },
  {
    place: 1,
    height: 'h-56 md:h-72',
    color: 'from-[#ffe14d] to-[#ffb020]',
    delay: 1.8,
    medal: '🥇',
  },
  {
    place: 3,
    height: 'h-28 md:h-40',
    color: 'from-[#f2a65a] to-[#c46a2b]',
    delay: 0.3,
    medal: '🥉',
  },
];

export function Podium({ data, celebrate = true }: { data: PodiumData; celebrate?: boolean }) {
  const t = useTranslations('game');
  const format = useFormatter();

  useEffect(() => {
    if (!celebrate) return;
    playSfx('fanfare');
    const a = setTimeout(() => fireworks(4000), 1800);
    const b = setTimeout(() => sideCannons(2500), 2000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [celebrate]);

  return (
    <div className="flex flex-col items-center gap-10">
      <div className="flex w-full max-w-4xl items-end justify-center gap-3 md:gap-6">
        {PLACES.map(({ place, height, color, delay, medal }) => {
          const p = data.top[place - 1];
          return (
            <div key={place} className="flex w-1/3 max-w-60 flex-col items-center">
              {p && (
                <motion.div
                  initial={{ opacity: 0, y: -40, scale: 0.5 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: delay + 0.4, type: 'spring', stiffness: 260, damping: 14 }}
                  className="mb-2 flex flex-col items-center text-center text-white"
                >
                  <motion.span
                    className="text-6xl md:text-7xl"
                    animate={
                      place === 1 ? { y: [0, -14, 0], rotate: [0, -8, 8, 0] } : { y: [0, -6, 0] }
                    }
                    transition={{
                      delay: delay + 1,
                      duration: 0.9,
                      repeat: Infinity,
                      repeatDelay: 0.4,
                    }}
                    aria-hidden="true"
                  >
                    {p.avatar}
                  </motion.span>
                  <span className="max-w-full truncate font-display text-xl font-extrabold md:text-2xl">
                    {p.nick}
                  </span>
                  <span className="font-display text-lg font-extrabold text-primary">
                    {format.number(p.score)}
                  </span>
                </motion.div>
              )}
              {/* Sin jugador en ese puesto (partidas pequeñas): no se dibuja el pedestal */}
              {p && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: 'auto' }}
                  transition={{ delay, duration: 0.6, ease: 'backOut' }}
                  className="w-full overflow-hidden"
                >
                  <div
                    className={cn(
                      'grid w-full place-items-start justify-center rounded-t-3xl bg-gradient-to-b pt-4 shadow-2xl',
                      height,
                      color,
                    )}
                  >
                    <span className="text-5xl" aria-label={t('place', { place })}>
                      {medal}
                    </span>
                  </div>
                </motion.div>
              )}
            </div>
          );
        })}
      </div>

      {data.top.length > 3 && (
        <ol className="flex flex-wrap justify-center gap-2" start={4}>
          {data.top.slice(3).map((p) => (
            <li key={p.id} className="rounded-full bg-white/12 px-4 py-2 font-bold text-white">
              {p.rank}. {p.avatar} {p.nick} · {format.number(p.score)}
            </li>
          ))}
        </ol>
      )}

      {data.highlights.length > 0 && <Highlights items={data.highlights} />}
    </div>
  );
}

const HIGHLIGHT_EMOJI: Record<Highlight['kind'], string> = {
  fastest: '⚡',
  longestStreak: '🔥',
  comeback: '🚀',
  hardest: '🧠',
  easiest: '🍰',
  perfect: '💯',
};

/** Repetición de la partida: momentos destacados, uno tras otro. */
function Highlights({ items }: { items: Highlight[] }) {
  const t = useTranslations('game.highlights');
  return (
    <section className="w-full max-w-5xl" aria-labelledby="highlights-title">
      <h2
        id="highlights-title"
        className="mb-4 text-center font-display text-2xl font-extrabold text-white"
      >
        🎬 {t('title')}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((h, i) => (
          <motion.li
            key={h.kind}
            initial={{ opacity: 0, y: 30, rotate: -3 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ delay: 3 + i * 0.6, type: 'spring', stiffness: 200, damping: 18 }}
            className="rounded-3xl bg-white/12 p-4 text-white backdrop-blur"
          >
            <p className="text-sm font-extrabold tracking-wide uppercase opacity-80">
              {HIGHLIGHT_EMOJI[h.kind]} {t(`${h.kind}.title`)}
            </p>
            <p className="mt-1 font-display text-xl leading-tight font-extrabold">
              {t(`${h.kind}.text`, {
                nick: `${h.avatar ?? ''} ${h.nick ?? ''}`.trim(),
                value: h.kind === 'fastest' ? (h.value / 1000).toFixed(2) : h.value,
                prompt: h.prompt ?? '',
              })}
            </p>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
