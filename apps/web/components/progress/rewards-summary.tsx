'use client';
// Resumen de recompensas al terminar algo: XP y monedas que "cuentan" hacia arriba, subida de
// nivel o rango, bono de racha diaria, logros desbloqueados y misiones completadas.
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { ACHIEVEMENTS, RANK_EMOJI, type ProgressOutcome, type RankId } from '@quiz-rush/shared';
import { burstConfetti } from '@/lib/game/effects';
import { playSfx } from '@/lib/game/sounds';

function Count({ to, prefix = '+' }: { to: number; prefix?: string }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `${prefix}${Math.round(v).toLocaleString()}`);
  useEffect(() => {
    const c = animate(mv, to, { duration: 1.1, ease: 'easeOut' });
    return () => c.stop();
  }, [mv, to]);
  return <motion.span>{text}</motion.span>;
}

export function RewardsSummary({ outcome }: { outcome: ProgressOutcome | null }) {
  const t = useTranslations('progress');
  const ta = useTranslations('achievements');
  const tm = useTranslations('missions');
  const ranks = useTranslations('ranks');
  const levelUp = !!outcome && outcome.levelAfter > outcome.levelBefore;
  const rankUp = !!outcome && outcome.rankAfter !== outcome.rankBefore;

  useEffect(() => {
    if (!outcome) return;
    if (levelUp || outcome.achievements.length) {
      playSfx('fanfare');
      burstConfetti(1.2);
    }
  }, [outcome, levelUp]);

  if (!outcome) {
    return <p className="text-center text-sm opacity-80">{t('alreadyRewarded')}</p>;
  }
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-black/30 p-3 text-center">
          <p className="font-display text-3xl font-black text-primary">
            <Count to={outcome.xp} /> XP
          </p>
          {outcome.dailyBonus && (
            <p className="text-xs font-bold opacity-85">
              🔥 {t('streakBonus', { days: outcome.dailyStreak, xp: outcome.dailyBonus.xp })}
            </p>
          )}
        </div>
        <div className="rounded-2xl bg-black/30 p-3 text-center">
          <p className="font-display text-3xl font-black text-[#ffe14d]">
            🪙 <Count to={outcome.coins} />
          </p>
          <p className="text-xs font-bold opacity-85">{t('coins')}</p>
        </div>
      </div>
      {levelUp && (
        <motion.p
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 12, delay: 0.4 }}
          className="rounded-2xl bg-primary px-4 py-3 text-center font-display text-2xl font-black text-primary-ink"
        >
          ⬆️ {t('levelUp', { level: outcome.levelAfter })}
          {rankUp && (
            <span className="block text-base">
              {RANK_EMOJI[outcome.rankAfter as RankId]}{' '}
              {t('rankUp', { rank: ranks(outcome.rankAfter) })}
            </span>
          )}
        </motion.p>
      )}
      {outcome.achievements.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label={t('newAchievements')}>
          {outcome.achievements.map((code, i) => {
            const def = ACHIEVEMENTS.find((a) => a.code === code);
            return (
              <motion.li
                key={code}
                initial={{ x: -30, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.6 + i * 0.15 }}
                className="flex items-center gap-3 rounded-2xl bg-[#ffe14d] px-3 py-2 text-[#1a1640]"
              >
                <span className="text-3xl" aria-hidden="true">
                  {def?.icon ?? '🏅'}
                </span>
                <span>
                  <span className="block text-xs font-black uppercase">
                    {t('achievementUnlocked')}
                  </span>
                  <span className="font-display font-extrabold">{ta(`${code}.name`)}</span>
                </span>
              </motion.li>
            );
          })}
        </ul>
      )}
      {outcome.missionsCompleted.length > 0 && (
        <p className="rounded-2xl bg-black/30 px-3 py-2 text-center text-sm font-bold">
          🎯 {t('missionsDone', { count: outcome.missionsCompleted.length })}:{' '}
          {outcome.missionsCompleted.map((c) => tm(`${c}`)).join(' · ')}
        </p>
      )}
    </div>
  );
}
