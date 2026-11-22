'use client';
// Mapa de la Aventura: cada mundo es un camino de niveles en zigzag. Los niveles bloqueados
// muestran un candado; los superados, sus estrellas.
import { motion } from 'motion/react';
import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { startSoloGame } from '@/lib/client-api';
import { cn } from '@/lib/utils';

interface World {
  id: string;
  emoji: string;
  color: string;
  levels: { key: string; level: number; stars: number; unlocked: boolean }[];
}

export function AdventureMap({ worlds }: { worlds: World[] }) {
  const t = useTranslations('solo');
  const te = useTranslations('errors');
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function play(key: string) {
    setBusy(key);
    try {
      router.push(`/solo/${await startSoloGame({ mode: 'ADVENTURE', level: key })}`);
    } catch (err) {
      const code = (err as Error).message;
      toast.error(te.has(code) ? te(code as 'INTERNAL') : te('INTERNAL'));
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {worlds.map((w) => {
        const open = w.levels[0]?.unlocked;
        const stars = w.levels.reduce((a, l) => a + l.stars, 0);
        return (
          <section
            key={w.id}
            aria-labelledby={`world-${w.id}`}
            className={cn(
              'relative overflow-hidden rounded-[2rem] p-5 pb-12 text-white shadow-xl',
              !open && 'grayscale-[.6]',
            )}
            style={{ background: `linear-gradient(135deg, ${w.color}, #1a1640)` }}
          >
            <div className="mb-4 flex items-center gap-3">
              <span className="text-5xl" aria-hidden="true">
                {w.emoji}
              </span>
              <div className="flex-1">
                <h2 id={`world-${w.id}`} className="font-display text-2xl font-black">
                  {t(`worlds.${w.id}`)}
                </h2>
                <p className="text-sm font-bold opacity-85">
                  ⭐ {stars} / {w.levels.length * 3}
                  {!open && ` · ${t('worldLocked')}`}
                </p>
              </div>
            </div>
            <ol className="relative grid grid-cols-3 gap-y-6 sm:grid-cols-6">
              {w.levels.map((l, i) => (
                <li
                  key={l.key}
                  className={cn('flex justify-center', i % 2 ? 'sm:translate-y-6' : '')}
                >
                  <motion.button
                    type="button"
                    whileHover={l.unlocked ? { scale: 1.08 } : undefined}
                    whileTap={l.unlocked ? { scale: 0.94 } : undefined}
                    disabled={!l.unlocked || busy !== null}
                    onClick={() => play(l.key)}
                    aria-label={
                      l.unlocked
                        ? t('levelLabel', { level: l.level, stars: l.stars })
                        : t('levelLocked', { level: l.level })
                    }
                    className={cn(
                      'relative grid size-20 cursor-pointer place-items-center rounded-full border-4 font-display text-2xl font-black shadow-[0_6px_0_0_rgba(0,0,0,.35)] disabled:cursor-not-allowed',
                      l.stars > 0
                        ? 'border-white bg-[#ffe14d] text-[#1a1640]'
                        : l.unlocked
                          ? 'border-white bg-white text-[#1a1640]'
                          : 'border-white/30 bg-black/30 text-white/60',
                      busy === l.key && 'animate-pulse',
                    )}
                  >
                    {l.unlocked ? l.level : <Lock className="size-6" />}
                    {l.unlocked && (
                      <span
                        className="absolute -bottom-3 text-sm tracking-tighter"
                        aria-hidden="true"
                      >
                        {[1, 2, 3].map((n) => (
                          <span key={n} className={n > l.stars ? 'opacity-30 grayscale' : ''}>
                            ⭐
                          </span>
                        ))}
                      </span>
                    )}
                  </motion.button>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
