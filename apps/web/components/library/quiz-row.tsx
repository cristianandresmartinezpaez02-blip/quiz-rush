'use client';
// Fila horizontal tipo Netflix: desplazamiento con flechas, arrastre táctil y ajuste por tarjeta.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRef, type ReactNode } from 'react';
import type { QuizCardData } from '@/lib/library-service';
import { QuizCard } from './quiz-card';

export function QuizRow({
  title,
  emoji,
  quizzes,
  seeAllHref,
}: {
  title: ReactNode;
  emoji: string;
  quizzes: QuizCardData[];
  seeAllHref?: string;
}) {
  const t = useTranslations('library');
  const scroller = useRef<HTMLUListElement>(null);
  if (quizzes.length === 0) return null;

  const scroll = (dir: 1 | -1) =>
    scroller.current?.scrollBy({
      left: dir * scroller.current.clientWidth * 0.85,
      behavior: 'smooth',
    });

  return (
    <section className="mb-10" aria-label={typeof title === 'string' ? title : undefined}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-2xl font-extrabold">
          <span aria-hidden="true">{emoji}</span> {title}
        </h2>
        <div className="flex items-center gap-1">
          {seeAllHref && (
            <Link href={seeAllHref} className="mr-2 text-sm font-bold text-accent hover:underline">
              {t('seeAll')}
            </Link>
          )}
          <button
            type="button"
            onClick={() => scroll(-1)}
            aria-label={t('scrollLeft')}
            className="hidden size-9 cursor-pointer place-items-center rounded-xl hover:bg-surface-2 sm:grid"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            aria-label={t('scrollRight')}
            className="hidden size-9 cursor-pointer place-items-center rounded-xl hover:bg-surface-2 sm:grid"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>
      <ul
        ref={scroller}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 [scrollbar-width:none] gap-4 overflow-x-auto px-4 pt-2 pb-4 [&::-webkit-scrollbar]:hidden"
      >
        {quizzes.map((quiz, i) => (
          <li key={quiz.id} className="w-[68vw] shrink-0 snap-start sm:w-64">
            <QuizCard quiz={quiz} priority={i < 4} />
          </li>
        ))}
      </ul>
    </section>
  );
}
