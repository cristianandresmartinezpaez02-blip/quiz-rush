// Biblioteca General: secciones tipo Netflix y, al buscar o filtrar, resultados con scroll infinito.
import type { Metadata } from 'next';
import Link from 'next/link';
import { after } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { hasLibraryFilters, libraryQuerySchema } from '@quiz-rush/shared';
import { QuizCard } from '@/components/library/quiz-card';
import { QuizRow } from '@/components/library/quiz-row';
import {
  getDailyChallenge,
  getFeaturedCreators,
  getForYou,
  getLibrarySections,
  maybeRefreshTrending,
  searchLibrary,
} from '@/lib/library-service';
import { getCurrentUser } from '@/lib/session';
import { LibraryBrowser } from './library-browser';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('library');
  return { title: t('title'), description: t('subtitle') };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LibraryPage({ searchParams }: Props) {
  const raw = Object.fromEntries(
    Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const parsed = libraryQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : {};
  const filtered = hasLibraryFilters(query);

  // Recalcula la tendencia en segundo plano (como mucho cada 10 min en todo el clúster)
  after(() => maybeRefreshTrending());

  const t = await getTranslations('library');
  const initialResults = filtered ? await searchLibrary({ ...query, cursor: undefined }) : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:py-10">
      {/* La key reinicia el buscador al navegar con un enlace (p. ej. "Ver todo") */}
      <LibraryBrowser
        key={JSON.stringify(query)}
        initialQuery={query}
        initialResults={initialResults}
      >
        {!filtered && <LibrarySections title={t('title')} />}
      </LibraryBrowser>
    </div>
  );
}

/** Secciones (Server Component): datos cacheados en Redis. */
async function LibrarySections({ title }: { title: string }) {
  const [t, user] = await Promise.all([getTranslations('library'), getCurrentUser()]);
  const [sections, daily, creators, forYou] = await Promise.all([
    getLibrarySections(),
    getDailyChallenge(),
    getFeaturedCreators(),
    user ? getForYou(user.id) : Promise.resolve([]),
  ]);

  return (
    <div aria-label={title}>
      {daily && (
        <section className="mb-10" aria-labelledby="daily-title">
          <div className="relative overflow-hidden rounded-[1.75rem] border-2 border-[var(--line)] bg-gradient-to-r from-accent/25 via-primary/15 to-transparent p-5 md:p-7">
            <div className="grid items-center gap-6 md:grid-cols-[1fr_20rem]">
              <div>
                <p className="mb-3 inline-flex rounded-full bg-accent px-3 py-1 text-xs font-extrabold text-accent-ink uppercase">
                  🔥 {t('dailyChallenge')}
                </p>
                <h2 id="daily-title" className="text-3xl font-extrabold md:text-4xl">
                  {daily.title}
                </h2>
                <p className="mt-2 max-w-xl text-muted">{daily.description}</p>
                <p className="mt-3 text-sm font-bold">{t('dailyHint')}</p>
              </div>
              <QuizCard quiz={daily} priority />
            </div>
          </div>
        </section>
      )}

      <QuizRow
        emoji="🔥"
        title={t('trending')}
        quizzes={sections.trending}
        seeAllHref="/biblioteca?sort=trending"
      />
      {forYou.length > 0 && <QuizRow emoji="🎯" title={t('forYou')} quizzes={forYou} />}
      <QuizRow
        emoji="✨"
        title={t('newThisWeek')}
        quizzes={sections.newThisWeek}
        seeAllHref="/biblioteca?sort=new"
      />
      <QuizRow
        emoji="⭐"
        title={t('topRated')}
        quizzes={sections.topRated}
        seeAllHref="/biblioteca?sort=top"
      />
      <QuizRow
        emoji="🎮"
        title={t('mostPlayed')}
        quizzes={sections.popular}
        seeAllHref="/biblioteca?sort=popular"
      />

      {creators.length > 0 && (
        <section className="mb-10" aria-labelledby="creators-title">
          <h2 id="creators-title" className="mb-3 text-2xl font-extrabold">
            🏆 {t('featuredCreators')}
          </h2>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {creators.map((c, i) => (
              <li key={c.username}>
                <Link
                  href={`/perfil/${c.username}`}
                  className="card flex h-full flex-col items-center gap-2 p-4 text-center transition-all hover:-translate-y-1 hover:border-accent"
                >
                  <span className="relative">
                    <span className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-accent to-primary font-display text-xl font-extrabold text-primary-ink">
                      {c.displayName
                        .split(/\s+/)
                        .map((w) => w[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    {i < 3 && (
                      <span className="absolute -top-2 -right-2 text-xl" aria-hidden="true">
                        {['🥇', '🥈', '🥉'][i]}
                      </span>
                    )}
                  </span>
                  <span className="font-extrabold">{c.displayName}</span>
                  <span className="text-xs text-muted">@{c.username}</span>
                  <span className="text-xs font-bold text-muted">
                    {t('creatorStats', {
                      quizzes: c.quizzes,
                      plays: c.plays,
                      followers: c.followersCount,
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
