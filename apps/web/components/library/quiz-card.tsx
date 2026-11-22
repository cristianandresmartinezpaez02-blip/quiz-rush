'use client';
// Tarjeta animada de quiz para la Biblioteca.
// Al pasar el ratón (o enfocar con teclado) se eleva y muestra una vista previa:
// la primera pregunta y los tipos de pregunta que contiene.
import { motion } from 'motion/react';
import { Clock, Play, Star } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { getTheme, QUESTION_TYPE_EMOJI } from '@quiz-rush/shared';
import type { QuizCardData } from '@/lib/library-service';
import { cn } from '@/lib/utils';

const DIFFICULTY_STYLE = {
  EASY: 'bg-[#a3e635] text-[#1a1640]',
  MEDIUM: 'bg-[#fb923c] text-[#1a1640]',
  HARD: 'bg-[#ff3d9a] text-white',
} as const;

export function QuizCard({
  quiz,
  className,
  priority,
}: {
  quiz: QuizCardData;
  className?: string;
  priority?: boolean;
}) {
  const t = useTranslations('library');
  const tc = useTranslations('common');
  const te = useTranslations('editor');
  const format = useFormatter();
  const theme = getTheme(quiz.theme);
  const minutes = Math.max(1, Math.round(quiz.durationSec / 60));

  return (
    <motion.article
      whileHover="hover"
      whileFocus="hover"
      initial="rest"
      animate="rest"
      variants={{ rest: { y: 0, scale: 1 }, hover: { y: -6, scale: 1.02 } }}
      transition={{ type: 'spring', stiffness: 400, damping: 26 }}
      className={cn('card group relative flex h-full flex-col overflow-hidden', className)}
    >
      <Link
        href={`/quiz/${quiz.id}`}
        className="absolute inset-0 z-10 rounded-[inherit]"
        aria-label={`${quiz.title} — ${quiz.author.displayName}`}
      />
      <div
        className="relative aspect-video overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }}
      >
        {quiz.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={quiz.coverUrl}
            alt=""
            loading={priority ? 'eager' : 'lazy'}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <motion.span
            variants={{ rest: { scale: 1, rotate: 0 }, hover: { scale: 1.2, rotate: 8 } }}
            className="absolute inset-0 grid place-items-center text-5xl"
            aria-hidden="true"
          >
            {theme.emoji}
          </motion.span>
        )}
        <span
          className={cn(
            'absolute top-2 left-2 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold',
            DIFFICULTY_STYLE[quiz.difficulty],
          )}
        >
          {te(`difficulties.${quiz.difficulty}`)}
        </span>
        <span className="absolute top-2 right-2 rounded-full bg-black/45 px-2.5 py-0.5 text-[11px] font-bold text-white backdrop-blur">
          {tc('questions', { count: quiz.questionCount })}
        </span>
        {quiz.language !== 'es' && (
          <span className="absolute bottom-2 left-2 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-extrabold text-white uppercase backdrop-blur">
            {quiz.language}
          </span>
        )}

        {/* Vista previa al pasar el ratón */}
        <motion.div
          variants={{ rest: { y: '100%', opacity: 0 }, hover: { y: 0, opacity: 1 } }}
          transition={{ duration: 0.2 }}
          className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/75 to-transparent p-3 pt-8 text-white"
          aria-hidden="true"
        >
          {quiz.firstQuestion && (
            <p className="line-clamp-2 text-xs font-bold">
              <span className="text-primary">{t('firstQuestion')}:</span> {quiz.firstQuestion}
            </p>
          )}
          <p className="mt-1 flex gap-1 text-sm">
            {quiz.questionTypes.map((type) => (
              <span key={type}>{QUESTION_TYPE_EMOJI[type]}</span>
            ))}
          </p>
        </motion.div>
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        <h3 className="line-clamp-2 leading-tight font-extrabold">{quiz.title}</h3>
        <p className="mt-1 truncate text-xs font-semibold text-muted">@{quiz.author.username}</p>
        <div className="mt-auto flex items-center gap-3 pt-3 text-xs font-bold text-muted">
          <span className="flex items-center gap-1" title={tc('plays', { count: quiz.playCount })}>
            <Play className="size-3.5 fill-current" />
            {format.number(quiz.playCount, { notation: 'compact' })}
          </span>
          <span
            className="flex items-center gap-1"
            title={t('ratingsCount', { count: quiz.ratingCount })}
          >
            <Star className="size-3.5 fill-[#ffc531] text-[#ffc531]" />
            {quiz.ratingCount ? format.number(quiz.ratingAvg, { maximumFractionDigits: 1 }) : '—'}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" />
            {tc('minutes', { count: minutes })}
          </span>
        </div>
      </div>
    </motion.article>
  );
}

/** Esqueleto de carga con la misma forma que la tarjeta. */
export function QuizCardSkeleton() {
  return (
    <div className="card overflow-hidden" aria-hidden="true">
      <div className="aspect-video animate-pulse bg-surface-2" />
      <div className="space-y-2 p-3.5">
        <div className="h-4 w-4/5 animate-pulse rounded bg-surface-2" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-surface-2" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-surface-2" />
      </div>
    </div>
  );
}
