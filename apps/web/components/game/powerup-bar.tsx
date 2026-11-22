'use client';
// Barra de power-ups del jugador: cada uno se usa una sola vez, antes de responder.
// El servidor decide si se puede usar y aplica el efecto; aquí solo se muestra.
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { POWER_UP_EMOJI, type PowerUp, type PublicQuestion } from '@quiz-rush/shared';
import { vibrate } from '@/lib/game/effects';
import { playSfx } from '@/lib/game/sounds';
import { cn } from '@/lib/utils';
import type { ActiveEffects } from './use-player-game';

const CHOICE_TYPES = ['MULTIPLE_CHOICE', 'AUDIO', 'REVEAL_IMAGE'];
const UNSCORED = ['POLL', 'WORD_CLOUD', 'OPEN_VOTE'];

/** Comprobación rápida en el cliente (el servidor hace la definitiva). */
function usable(type: PowerUp, q: PublicQuestion): boolean {
  if (UNSCORED.includes(q.type) || q.points === 'NONE') return false;
  if (type === 'fifty')
    return CHOICE_TYPES.includes(q.type) && !q.multiSelect && q.options.length > 2;
  if (type === 'hint') return q.hasHint;
  if (type === 'second') return q.type !== 'DRAW';
  return true;
}

export function PowerUpBar({
  powerUps,
  question,
  effects,
  onUse,
  errorText,
}: {
  powerUps: PowerUp[];
  question: PublicQuestion;
  effects: ActiveEffects | null;
  onUse: (type: PowerUp) => Promise<string | null>;
  errorText: (code: string) => string;
}) {
  const t = useTranslations('game.powerUps');
  const [busy, setBusy] = useState<PowerUp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = effects?.qIndex === question.index ? effects.active : [];
  if (powerUps.length === 0 && active.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <ul className="flex flex-wrap items-center justify-center gap-2" aria-label={t('title')}>
        {powerUps.map((p) => {
          const ok = usable(p, question);
          return (
            <li key={p}>
              <motion.button
                type="button"
                whileTap={{ scale: 0.85 }}
                disabled={!ok || busy !== null}
                title={t(`${p}.desc`)}
                aria-label={`${t(`${p}.name`)}: ${t(`${p}.desc`)}`}
                onClick={async () => {
                  setBusy(p);
                  setError(null);
                  const err = await onUse(p);
                  setBusy(null);
                  if (err) setError(errorText(err));
                  else {
                    vibrate([10, 30, 10]);
                    playSfx('pop');
                  }
                }}
                className={cn(
                  'flex h-11 cursor-pointer items-center gap-1.5 rounded-full bg-[#ffe14d] px-3 text-sm font-black text-[#1a1640] shadow-[0_4px_0_0_rgba(0,0,0,.3)] active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40',
                  busy === p && 'animate-pulse',
                )}
              >
                <span aria-hidden="true">{POWER_UP_EMOJI[p]}</span>
                {t(`${p}.name`)}
              </motion.button>
            </li>
          );
        })}
        {active.map((p) => (
          <li
            key={`on-${p}`}
            className="flex h-11 items-center gap-1.5 rounded-full bg-[#12a150] px-3 text-sm font-black text-white"
          >
            <span aria-hidden="true">{POWER_UP_EMOJI[p]}</span> {t(`${p}.active`)}
          </li>
        ))}
      </ul>
      {effects?.qIndex === question.index && effects.hint && (
        <motion.p
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-[#ffe14d] px-3 py-2 text-center text-sm font-bold text-[#1a1640]"
        >
          💡 {effects.hint}
        </motion.p>
      )}
      {error && (
        <p role="alert" className="text-center text-xs font-bold">
          {error}
        </p>
      )}
    </div>
  );
}
