'use client';
// Buscador instantáneo + filtros + resultados con scroll infinito.
// El estado vive en la URL (se puede compartir y volver atrás); los resultados se piden al API
// sin recargar la página, cancelando las peticiones obsoletas mientras se escribe.
import { AnimatePresence, motion } from 'motion/react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CATEGORIES,
  DIFFICULTIES,
  hasLibraryFilters,
  LANGUAGES,
  LIBRARY_SORTS,
  QUESTION_TYPE_EMOJI,
  QUESTION_TYPES,
  type LibraryQuery,
} from '@quiz-rush/shared';
import { QuizCard, QuizCardSkeleton } from '@/components/library/quiz-card';
import { EmptyState } from '@/components/ui/empty-state';
import type { LibraryPage } from '@/lib/library-service';
import { cn } from '@/lib/utils';

type Filters = Omit<LibraryQuery, 'cursor' | 'limit'>;

function toSearchParams(f: Filters) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) params.set(k, String(v));
  return params;
}

export function LibraryBrowser({
  initialQuery,
  initialResults,
  children,
}: {
  initialQuery: Filters;
  initialResults: LibraryPage | null;
  children: ReactNode;
}) {
  const t = useTranslations('library');
  const tq = useTranslations('questionTypes');
  const tcat = useTranslations('categories');
  const tl = useTranslations('languages');
  const te = useTranslations('editor');
  const pathname = usePathname();

  const [filters, setFilters] = useState<Filters>(initialQuery);
  const [text, setText] = useState(initialQuery.q ?? '');
  const [results, setResults] = useState<LibraryPage | null>(initialResults);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showFilters, setShowFilters] = useState(
    !!(
      initialQuery.language ||
      initialQuery.difficulty ||
      initialQuery.duration ||
      initialQuery.type
    ),
  );
  const abortRef = useRef<AbortController | null>(null);
  const filtersRef = useRef<Filters>(initialQuery);
  const sentinel = useRef<HTMLDivElement>(null);
  const active = hasLibraryFilters(filters);

  /** Aplica nuevos filtros: actualiza la URL y pide la primera página (cancelando la anterior). */
  const runSearch = useCallback(
    (next: Filters) => {
      filtersRef.current = next;
      setFilters(next);
      const params = toSearchParams(next);
      // history.replaceState actualiza la URL sin volver a renderizar en el servidor
      // (los resultados se piden al API aquí mismo: evita consultas duplicadas)
      window.history.replaceState(null, '', params.size ? `${pathname}?${params}` : pathname);
      abortRef.current?.abort();
      if (!hasLibraryFilters(next)) {
        setResults(null);
        setLoading(false);
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      fetch(`/api/library?${params}`, { signal: controller.signal })
        .then((res) => (res.ok ? (res.json() as Promise<LibraryPage>) : null))
        .then((data) => {
          if (data) setResults(data);
        })
        .catch(() => {})
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    },
    [pathname],
  );

  // Escribir en el buscador lanza la búsqueda tras una pausa de 250 ms (búsqueda instantánea)
  useEffect(() => {
    const timer = setTimeout(() => {
      const q = text.trim() || undefined;
      if ((filtersRef.current.q ?? '') !== (q ?? '')) runSearch({ ...filtersRef.current, q });
    }, 250);
    return () => clearTimeout(timer);
  }, [text, runSearch]);

  // Scroll infinito: al ver el final de la lista se pide la siguiente página
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !results?.nextCursor) return;
    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry?.isIntersecting || loadingMore || !results.nextCursor) return;
        setLoadingMore(true);
        const params = toSearchParams(filters);
        params.set('cursor', results.nextCursor);
        try {
          const res = await fetch(`/api/library?${params}`);
          if (res.ok) {
            const next = (await res.json()) as LibraryPage;
            setResults((prev) =>
              prev ? { items: [...prev.items, ...next.items], nextCursor: next.nextCursor } : next,
            );
          }
        } finally {
          setLoadingMore(false);
        }
      },
      { rootMargin: '600px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [results, filters, loadingMore]);

  const set = <K extends keyof Filters>(key: K, value: Filters[K] | undefined) =>
    runSearch({ ...filtersRef.current, [key]: value || undefined });

  const clearAll = () => {
    setText('');
    runSearch({});
  };

  const select =
    'h-10 cursor-pointer rounded-xl border-2 border-line bg-surface px-3 text-sm font-bold outline-none focus:border-accent';

  return (
    <>
      <header className="mb-8">
        <h1 className="text-4xl font-extrabold md:text-5xl">{t('title')}</h1>
        <p className="mt-1 text-muted">{t('subtitle')}</p>

        <div className="mt-6 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
            <label htmlFor="library-search" className="sr-only">
              {t('searchPlaceholder')}
            </label>
            <input
              id="library-search"
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('searchPlaceholder')}
              maxLength={80}
              autoComplete="off"
              className="h-14 w-full rounded-2xl border-2 border-line bg-surface pr-4 pl-12 text-lg font-semibold shadow-[0_5px_0_0_var(--line)] outline-none focus:border-accent"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters}
            aria-controls="library-filters"
            className={cn(
              'flex h-14 cursor-pointer items-center gap-2 rounded-2xl border-2 px-4 font-bold',
              showFilters ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface',
            )}
          >
            <SlidersHorizontal className="size-5" />
            <span className="hidden sm:inline">{t('filters')}</span>
          </button>
        </div>

        {/* Categorías como chips desplazables */}
        <div
          className="-mx-4 mt-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1"
          role="group"
          aria-label={te('category')}
        >
          {CATEGORIES.map((c) => {
            const on = filters.category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => set('category', on ? undefined : c.id)}
                className={cn(
                  'shrink-0 cursor-pointer rounded-full border-2 px-3.5 py-1.5 text-sm font-bold whitespace-nowrap transition-colors',
                  on
                    ? 'border-accent bg-accent text-accent-ink'
                    : 'border-line bg-surface hover:border-accent/60',
                )}
              >
                {c.emoji} {tcat(c.id)}
              </button>
            );
          })}
        </div>

        <AnimatePresence initial={false}>
          {showFilters && (
            <motion.div
              id="library-filters"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 flex flex-wrap gap-2">
                <select
                  aria-label={te('language')}
                  className={select}
                  value={filters.language ?? ''}
                  onChange={(e) => set('language', e.target.value as Filters['language'])}
                >
                  <option value="">{t('anyLanguage')}</option>
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {tl(l)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={te('difficulty')}
                  className={select}
                  value={filters.difficulty ?? ''}
                  onChange={(e) => set('difficulty', e.target.value as Filters['difficulty'])}
                >
                  <option value="">{t('anyDifficulty')}</option>
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {te(`difficulties.${d}`)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t('duration')}
                  className={select}
                  value={filters.duration ?? ''}
                  onChange={(e) => set('duration', e.target.value as Filters['duration'])}
                >
                  <option value="">{t('anyDuration')}</option>
                  <option value="short">{t('durationShort')}</option>
                  <option value="medium">{t('durationMedium')}</option>
                  <option value="long">{t('durationLong')}</option>
                </select>
                <select
                  aria-label={te('type')}
                  className={select}
                  value={filters.type ?? ''}
                  onChange={(e) => set('type', e.target.value as Filters['type'])}
                >
                  <option value="">{t('anyType')}</option>
                  {QUESTION_TYPES.map((qt) => (
                    <option key={qt} value={qt}>
                      {QUESTION_TYPE_EMOJI[qt]} {tq(qt)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t('sortBy')}
                  className={select}
                  value={filters.sort ?? ''}
                  onChange={(e) => set('sort', e.target.value as Filters['sort'])}
                >
                  <option value="">{t('sortDefault')}</option>
                  {LIBRARY_SORTS.map((s) => (
                    <option key={s} value={s}>
                      {t(`sorts.${s}`)}
                    </option>
                  ))}
                </select>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {active && (
          <button
            type="button"
            onClick={clearAll}
            className="mt-4 flex cursor-pointer items-center gap-1 text-sm font-bold text-accent"
          >
            <X className="size-4" /> {t('clearFilters')}
          </button>
        )}
      </header>

      {active ? (
        <section aria-live="polite" aria-busy={loading}>
          {loading && !results ? (
            <ResultsGrid>
              {Array.from({ length: 8 }, (_, i) => (
                <QuizCardSkeleton key={i} />
              ))}
            </ResultsGrid>
          ) : results && results.items.length === 0 ? (
            <EmptyState emoji="🔍" title={t('noResultsTitle')} text={t('noResultsText')} />
          ) : (
            <div className={cn('transition-opacity', loading && 'opacity-50')}>
              <ResultsGrid>
                {results?.items.map((quiz, i) => (
                  <motion.div
                    key={quiz.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i % 24, 12) * 0.025 }}
                  >
                    <QuizCard quiz={quiz} priority={i < 4} />
                  </motion.div>
                ))}
                {loadingMore &&
                  Array.from({ length: 4 }, (_, i) => <QuizCardSkeleton key={`s${i}`} />)}
              </ResultsGrid>
              <div ref={sentinel} className="h-1" />
            </div>
          )}
        </section>
      ) : (
        children
      )}
    </>
  );
}

function ResultsGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>;
}
