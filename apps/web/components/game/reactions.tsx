'use client';
// Reacciones en vivo: los jugadores mandan emojis que flotan por la pantalla del anfitrión.
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { REACTIONS, type Reaction } from '@quiz-rush/shared';
import { GAME_LIMITS } from '@quiz-rush/shared';
import type { GameClient } from '@/lib/game/socket';
import { vibrate } from '@/lib/game/effects';

interface Floater {
  id: number;
  emoji: string;
  x: number;
  drift: number;
}

/** Capa de emojis flotantes (pantalla). Como máximo 40 a la vez para no saturar. */
export function ReactionsLayer({ socket }: { socket: GameClient | null }) {
  const [items, setItems] = useState<Floater[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    if (!socket) return;
    const onReactions = (batch: Partial<Record<Reaction, number>>) => {
      const spawned: Floater[] = [];
      for (const [emoji, count] of Object.entries(batch)) {
        for (let i = 0; i < Math.min(count ?? 0, 6); i++) {
          spawned.push({
            id: nextId.current++,
            emoji,
            x: 5 + Math.random() * 90,
            drift: (Math.random() - 0.5) * 120,
          });
        }
      }
      setItems((prev) => [...prev, ...spawned].slice(-40));
    };
    socket.on('reactions', onReactions);
    return () => {
      socket.off('reactions', onReactions);
    };
  }, [socket]);

  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden="true">
      <AnimatePresence>
        {items.map((f) => (
          <motion.span
            key={f.id}
            className="absolute bottom-0 text-5xl"
            style={{ left: `${f.x}%` }}
            initial={{ y: 40, opacity: 0, scale: 0.4 }}
            animate={{
              y: -window.innerHeight * 0.85,
              x: f.drift,
              opacity: [0, 1, 1, 0],
              scale: [0.4, 1.2, 1, 0.9],
            }}
            transition={{ duration: 3.2, ease: 'easeOut' }}
            onAnimationComplete={() => setItems((prev) => prev.filter((x) => x.id !== f.id))}
          >
            {f.emoji}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Barra de reacciones del jugador (con enfriamiento para no hacer spam). */
export function ReactionBar({ socket }: { socket: GameClient | null }) {
  const t = useTranslations('game');
  const [coolingDown, setCoolingDown] = useState(false);

  const send = (emoji: Reaction) => {
    if (!socket || coolingDown) return;
    socket.emit('player:react', { emoji });
    vibrate(8);
    setCoolingDown(true);
    setTimeout(() => setCoolingDown(false), GAME_LIMITS.reactionCooldownMs);
  };

  return (
    <div className="flex justify-center gap-1.5" role="group" aria-label={t('react')}>
      {REACTIONS.slice(0, 6).map((emoji) => (
        <motion.button
          key={emoji}
          type="button"
          whileTap={{ scale: 1.4, rotate: 12 }}
          onClick={() => send(emoji)}
          disabled={coolingDown}
          aria-label={`${t('react')} ${emoji}`}
          className="grid size-12 cursor-pointer place-items-center rounded-2xl bg-white/12 text-2xl transition-opacity disabled:opacity-40"
        >
          {emoji}
        </motion.button>
      ))}
    </div>
  );
}
