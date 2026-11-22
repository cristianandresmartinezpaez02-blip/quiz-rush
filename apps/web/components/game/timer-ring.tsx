'use client';
// Temporizador circular: se vacía con el tiempo y late en rojo los últimos 5 segundos.
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

export function TimerRing({
  remainingMs,
  totalMs,
  size = 96,
  className,
}: {
  remainingMs: number;
  totalMs: number;
  size?: number;
  className?: string;
}) {
  const seconds = Math.ceil(remainingMs / 1000);
  const fraction = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const r = size / 2 - 7;
  const circumference = 2 * Math.PI * r;
  const urgent = seconds <= 5 && remainingMs > 0;

  return (
    <motion.div
      className={cn('relative grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
      animate={urgent ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      transition={urgent ? { duration: 0.5, repeat: Infinity } : undefined}
      role="timer"
      aria-live="off"
      aria-label={`${seconds} s`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="rgba(0,0,0,.35)"
          stroke="rgba(255,255,255,.15)"
          strokeWidth={7}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={urgent ? '#ff3d9a' : '#ffe14d'}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          style={{ transition: 'stroke-dashoffset 0.1s linear, stroke 0.3s' }}
        />
      </svg>
      <span
        className="absolute font-display font-extrabold text-white tabular-nums"
        style={{ fontSize: size * 0.36 }}
      >
        {seconds}
      </span>
    </motion.div>
  );
}
