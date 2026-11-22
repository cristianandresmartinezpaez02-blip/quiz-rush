'use client';
// Estrellas de calificación: solo lectura (con medias estrellas) e interactivas (calificar).
import { motion } from 'motion/react';
import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { cn, haptic } from '@/lib/utils';

export function StarsDisplay({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center', className)} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1)));
        return (
          <span key={n} className="relative inline-block size-4">
            <Star className="absolute inset-0 size-4 text-muted/40" strokeWidth={2} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className="size-4 fill-[#ffc531] text-[#ffc531]" strokeWidth={2} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Selector de 1 a 5 estrellas accesible (grupo de radio con teclado). */
export function StarRating({
  value,
  onRate,
  disabled,
}: {
  value: number | null;
  onRate: (stars: number) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('quiz');
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;

  return (
    <div
      role="radiogroup"
      aria-label={t('rateThis')}
      className="flex items-center gap-0.5"
      onMouseLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <motion.button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={t('starsLabel', { count: n })}
          disabled={disabled}
          whileTap={{ scale: 0.8 }}
          whileHover={{ scale: 1.15, rotate: -8 }}
          onMouseEnter={() => setHover(n)}
          onFocus={() => setHover(n)}
          onBlur={() => setHover(null)}
          onClick={() => {
            haptic(12);
            onRate(n);
          }}
          className="cursor-pointer p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Star
            className={cn(
              'size-7 transition-colors',
              n <= shown ? 'fill-[#ffc531] text-[#ffc531]' : 'text-muted/50',
            )}
            strokeWidth={2}
          />
        </motion.button>
      ))}
    </div>
  );
}
