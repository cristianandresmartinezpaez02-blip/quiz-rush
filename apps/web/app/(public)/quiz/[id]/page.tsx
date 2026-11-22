// Página pública de un quiz: portada, autor, acciones, preguntas (sin respuestas),
// ranking de mejores puntajes, comentarios y quizzes similares.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { getTheme, QUESTION_TYPE_EMOJI } from '@quiz-rush/shared';
import { StarsDisplay } from '@/components/library/stars';
import { QuizRow } from '@/components/library/quiz-row';
import { Comments } from '@/components/quiz/comments';
import { QuizActions } from '@/components/quiz/quiz-actions';
import { FollowButton } from '@/components/social/follow-button';
import { isFollowing } from '@/lib/community-service';
import { getPublicQuiz, getQuizLeaderboard, getSimilarQuizzes } from '@/lib/library-service';
import { getCurrentUser } from '@/lib/session';

type Props = { params: Promise<{ id: string }> };

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const quiz = await getPublicQuiz((await params).id);
  if (!quiz || quiz.status !== 'PUBLISHED') return {};
  const description =
    quiz.description ?? `${quiz.questionCount} preguntas · @${quiz.author.username}`;
  return {
    title: quiz.title,
    description,
    alternates: { canonical: `/quiz/${quiz.id}` },
    openGraph: { title: quiz.title, description, type: 'website', url: `/quiz/${quiz.id}` },
    twitter: { card: 'summary_large_image', title: quiz.title, description },
  };
}

export default async function QuizPage({ params }: Props) {
  const { id } = await params;
  const [quiz, user] = await Promise.all([getPublicQuiz(id), getCurrentUser()]);
  // Oculto por moderación: solo lo ve su autor
  if (!quiz || (quiz.status === 'HIDDEN' && user?.id !== quiz.author.id)) notFound();

  const [t, tc, te, tq, tcat, tl, format, similar, leaderboard, following] = await Promise.all([
    getTranslations('quiz'),
    getTranslations('common'),
    getTranslations('editor'),
    getTranslations('questionTypes'),
    getTranslations('categories'),
    getTranslations('languages'),
    getFormatter(),
    getSimilarQuizzes(quiz),
    getQuizLeaderboard(quiz.id),
    user ? isFollowing(user.id, quiz.author.id) : Promise.resolve(false),
  ]);

  const theme = getTheme(quiz.theme);
  const viewer = user ? { id: user.id, isGuest: user.isAnonymous } : null;
  const minutes = Math.max(1, Math.round(quiz.durationSec / 60));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {quiz.status === 'HIDDEN' && (
        <p className="mb-4 rounded-2xl bg-danger/15 p-4 font-bold text-danger">
          ⚠️ {t('hiddenNotice')}
        </p>
      )}

      {/* Cabecera */}
      <section className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <div
          className="relative aspect-video overflow-hidden rounded-[1.75rem] shadow-2xl"
          style={{ background: `linear-gradient(140deg, ${theme.from}, ${theme.to})` }}
        >
          {quiz.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={quiz.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <span
              className="absolute inset-0 grid animate-float place-items-center text-8xl"
              aria-hidden="true"
            >
              {theme.emoji}
            </span>
          )}
        </div>

        <div>
          <div className="mb-3 flex flex-wrap gap-2 text-xs font-extrabold">
            {quiz.category && (
              <Link
                href={`/biblioteca?category=${quiz.category}`}
                className="rounded-full bg-accent/15 px-3 py-1 text-accent"
              >
                {tcat(quiz.category)}
              </Link>
            )}
            <span className="rounded-full bg-surface-2 px-3 py-1">
              {te(`difficulties.${quiz.difficulty}`)}
            </span>
            <span className="rounded-full bg-surface-2 px-3 py-1">{tl(quiz.language)}</span>
          </div>
          <h1 className="text-3xl leading-tight font-extrabold md:text-5xl">{quiz.title}</h1>

          {quiz.remixOf && (
            <p className="mt-2 text-sm text-muted">
              🔀 {t('remixOf')}{' '}
              <Link
                href={`/quiz/${quiz.remixOf.id}`}
                className="font-bold text-accent hover:underline"
              >
                {quiz.remixOf.title}
              </Link>{' '}
              · @{quiz.remixOf.username}
            </p>
          )}

          <div className="mt-4 flex items-center gap-3">
            <Link
              href={`/perfil/${quiz.author.username}`}
              className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-accent to-primary font-display font-extrabold text-primary-ink"
              aria-hidden="true"
              tabIndex={-1}
            >
              {quiz.author.displayName.slice(0, 1).toUpperCase()}
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                href={`/perfil/${quiz.author.username}`}
                className="block truncate font-extrabold hover:underline"
              >
                {quiz.author.displayName}
              </Link>
              <p className="text-xs text-muted">
                @{quiz.author.username} ·{' '}
                {t('followersCount', { count: quiz.author.followersCount })}
              </p>
            </div>
            <FollowButton userId={quiz.author.id} initialFollowing={following} viewer={viewer} />
          </div>

          <dl className="mt-5 grid grid-cols-4 gap-2 text-center">
            {[
              { label: t('questionsLabel'), value: quiz.questionCount },
              {
                label: t('playsLabel'),
                value: format.number(quiz.playCount, { notation: 'compact' }),
              },
              { label: t('durationLabel'), value: tc('minutes', { count: minutes }) },
              { label: t('remixesLabel'), value: quiz.remixCount },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl bg-surface-2 px-1 py-3">
                <dd className="font-display text-xl font-extrabold">{s.value}</dd>
                <dt className="text-[11px] font-bold text-muted uppercase">{s.label}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-3 flex items-center gap-2 text-sm">
            <StarsDisplay value={quiz.ratingAvg} />
            <span className="font-bold">
              {quiz.ratingCount ? format.number(quiz.ratingAvg, { maximumFractionDigits: 1 }) : '—'}
            </span>
            <span className="text-muted">({t('ratingsCount', { count: quiz.ratingCount })})</span>
          </p>
        </div>
      </section>

      <div className="mt-8">
        <QuizActions
          quizId={quiz.id}
          title={quiz.title}
          shareUrl={`${appUrl}/quiz/${quiz.id}`}
          viewer={viewer}
          favoriteCount={quiz.favoriteCount}
          ratingAvg={quiz.ratingAvg}
          ratingCount={quiz.ratingCount}
        />
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-10">
          {(quiz.description || quiz.tags.length > 0) && (
            <section aria-labelledby="about-title">
              <h2 id="about-title" className="mb-3 text-2xl font-extrabold">
                {t('about')}
              </h2>
              {quiz.description && (
                <p className="text-lg whitespace-pre-line">{quiz.description}</p>
              )}
              {quiz.tags.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {quiz.tags.map((tag) => (
                    <li key={tag}>
                      <Link
                        href={`/biblioteca?q=${encodeURIComponent(tag)}`}
                        className="rounded-full bg-surface-2 px-3 py-1 text-sm font-bold hover:bg-accent/15"
                      >
                        #{tag}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section aria-labelledby="questions-title">
            <h2 id="questions-title" className="mb-1 text-2xl font-extrabold">
              📝 {t('questionsTitle')}
            </h2>
            <p className="mb-4 text-sm text-muted">{t('questionsHint')}</p>
            <ol className="flex flex-col gap-2">
              {quiz.questions.map((q, i) => (
                <li key={q.id} className="card flex items-center gap-3 px-4 py-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 font-display text-sm font-extrabold">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 font-semibold">{q.prompt}</span>
                  <span
                    className="hidden shrink-0 text-xs font-bold text-muted sm:inline"
                    title={tq(q.type)}
                  >
                    {QUESTION_TYPE_EMOJI[q.type]} {tq(q.type)} · {q.timeLimit}s
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <Comments
            quizId={quiz.id}
            quizAuthorId={quiz.author.id}
            viewer={viewer}
            initialCount={quiz.commentCount}
          />
        </div>

        <aside aria-labelledby="leaderboard-title">
          <div className="card sticky top-24 p-5">
            <h2 id="leaderboard-title" className="mb-3 text-xl font-extrabold">
              🏆 {t('leaderboard')}
            </h2>
            {leaderboard.length === 0 ? (
              <p className="text-sm text-muted">{t('leaderboardEmpty')}</p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {leaderboard.map((row, i) => (
                  <li
                    key={`${row.nickname}-${i}`}
                    className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2"
                  >
                    <span className="w-6 text-center font-extrabold">
                      {['🥇', '🥈', '🥉'][i] ?? i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-bold">{row.nickname}</span>
                    <span className="font-display font-extrabold">{format.number(row.score)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>

      {similar.length > 0 && (
        <div className="mt-14">
          <QuizRow emoji="🧭" title={t('similar')} quizzes={similar} />
        </div>
      )}
    </div>
  );
}
