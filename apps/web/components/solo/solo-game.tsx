'use client';
// Partida individual en el navegador. El servidor corrige y mide el tiempo; aquí solo se
// muestra la pregunta, se envía la respuesta y se enseña la solución (para aprender del fallo).
import { AnimatePresence, motion } from 'motion/react';
import { Check, Flame, Home, RotateCcw, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  getTheme,
  parseLevelKey,
  type AnswerPayload,
  type PublicQuestion,
  type SoloAnswerResult,
  type SoloSummary,
  type SoloView,
} from '@quiz-rush/shared';
import { MediaView } from '@/components/editor/media';
import { ShareResultButton } from '@/components/social/share-result';
import { AnswerPad } from '@/components/game/answers';
import { TypePad } from '@/components/game/pads';
import { TimerRing } from '@/components/game/timer-ring';
import { RevealImage } from '@/components/game/type-views';
import { RewardsSummary } from '@/components/progress/rewards-summary';
import { useCountdown } from '@/hooks/use-countdown';
import { apiFetch, startSoloGame } from '@/lib/client-api';
import { celebrate, vibrate } from '@/lib/game/effects';
import { clockOffset } from '@/lib/game/socket';
import { playSfx, preloadSounds } from '@/lib/game/sounds';
import { cn } from '@/lib/utils';

type AnswerResponse = SoloAnswerResult & { next: SoloView | null; summary: SoloSummary | null };

export function SoloGame({
  initial,
  initialSummary,
  celebration,
}: {
  initial: SoloView;
  initialSummary: SoloSummary | null;
  celebration: string | null;
}) {
  const t = useTranslations('solo');
  const te = useTranslations('errors');
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [offset, setOffset] = useState(() => clockOffset(initial.serverNow));
  const [feedback, setFeedback] = useState<{ q: PublicQuestion; res: AnswerResponse } | null>(null);
  const [summary, setSummary] = useState<SoloSummary | null>(initialSummary);
  /** Resumen listo, pero primero se enseña la corrección de la última pregunta */
  const [pending, setPending] = useState<SoloSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<'ok' | 'ko' | null>(null);
  const theme = getTheme(view.theme);
  const isRush = view.mode === 'RUSH';
  const remaining = useCountdown(view.endsAt, offset);
  const errorText = (code: string) => (te.has(code) ? te(code as 'INTERNAL') : te('INTERNAL'));

  useEffect(() => preloadSounds(), []);

  const apply = (v: SoloView) => {
    setView(v);
    setOffset(clockOffset(v.serverNow));
  };

  async function submit(answer: Omit<AnswerPayload, 'qIndex'> | null) {
    if (busy || !view.question) return;
    const q = view.question;
    setBusy(true);
    try {
      const res = await apiFetch<AnswerResponse>(`/api/solo/${view.id}/answer`, {
        method: 'POST',
        body: answer ? { qIndex: view.qIndex, answer } : { qIndex: view.qIndex, timeout: true },
      });
      playSfx(res.correct ? 'correct' : 'wrong');
      vibrate(res.correct ? 30 : [80]);
      if (res.summary) {
        if (isRush) setSummary(res.summary);
        else {
          setPending(res.summary);
          setFeedback({ q, res });
        }
        return;
      }
      if (isRush && res.next) {
        // Rush: sin pausa, un destello y la siguiente
        setFlash(res.correct ? 'ok' : 'ko');
        setTimeout(() => setFlash(null), 280);
        apply(res.next);
        return;
      }
      setFeedback({ q, res });
      setView((v) => ({ ...v, score: res.score, streak: res.streak, question: null }));
    } catch (err) {
      const code = (err as Error).message;
      if (code === 'WRONG_QUESTION' || code === 'FINISHED') {
        const fresh = await apiFetch<{ view: SoloView; summary: SoloSummary | null }>(
          `/api/solo/${view.id}`,
        );
        apply(fresh.view);
        setSummary(fresh.summary);
      } else toast.error(errorText(code));
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    setBusy(true);
    try {
      apply(await apiFetch<SoloView>(`/api/solo/${view.id}/next`, { method: 'POST' }));
      setFeedback(null);
    } catch (err) {
      toast.error(errorText((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function finishNow() {
    setBusy(true);
    try {
      setSummary(await apiFetch<SoloSummary>(`/api/solo/${view.id}/finish`, { method: 'POST' }));
    } catch (err) {
      toast.error(errorText((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  // Se acabó el tiempo: en el Rush termina la partida; en el resto, la pregunta cuenta como no respondida
  const onTimeUp = useEffectEvent(() => {
    if (summary || busy) return;
    if (isRush) void finishNow();
    else if (view.question) void submit(null);
  });
  const expired = view.endsAt !== null && remaining <= 0 && !summary && (isRush || !!view.question);
  useEffect(() => {
    if (!expired) return;
    const id = setTimeout(onTimeUp, 0);
    return () => clearTimeout(id);
  }, [expired]);

  // Celebración al terminar con buen resultado
  const celebrated = useRef(false);
  useEffect(() => {
    if (!summary || celebrated.current) return;
    celebrated.current = true;
    const good =
      summary.personalBest ||
      (summary.stars ?? 0) >= 2 ||
      (summary.total > 0 && summary.correct / summary.total >= 0.7);
    if (good) celebrate(celebration);
  }, [summary, celebration]);

  async function playAgain() {
    setBusy(true);
    try {
      const input =
        view.mode === 'PRACTICE'
          ? { mode: 'PRACTICE', quizId: view.ref }
          : view.mode === 'ADVENTURE'
            ? { mode: 'ADVENTURE', level: view.ref }
            : { mode: view.mode };
      router.push(`/solo/${await startSoloGame(input)}`);
    } catch (err) {
      toast.error(errorText((err as Error).message));
      setBusy(false);
    }
  }

  const title = view.title || t(`modes.${view.mode}.name`);
  const total = view.question
    ? view.question.timeLimit * 1000 * (1 + (view.extraPct ?? 0) / 100)
    : 1;

  return (
    <div
      className="relative flex min-h-[calc(100dvh-4rem)] flex-col text-white"
      style={{ background: `linear-gradient(160deg, ${theme.from}, ${theme.to})` }}
    >
      <AnimatePresence>
        {flash && (
          <motion.div
            key={flash}
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className={cn(
              'pointer-events-none fixed inset-0 z-30',
              flash === 'ok' ? 'bg-[#12a150]' : 'bg-[#e5484d]',
            )}
          />
        )}
      </AnimatePresence>
      <header className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1 truncate font-display text-lg font-extrabold">{title}</span>
        {!summary && (
          <>
            {view.streak >= 2 && (
              <span className="flex items-center gap-1 rounded-full bg-[#ff3d9a] px-3 py-1 text-sm font-extrabold">
                <Flame className="size-4" /> {view.streak}
              </span>
            )}
            <span
              className="rounded-xl bg-black/30 px-3 py-1.5 font-display font-extrabold tabular-nums"
              aria-label={t('score')}
            >
              {isRush ? `⚡ ${view.score}` : view.score.toLocaleString()}
            </span>
          </>
        )}
      </header>

      <main
        id="contenido"
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 pb-8"
      >
        {summary ? (
          <SummaryView summary={summary} view={view} busy={busy} onAgain={playAgain} />
        ) : feedback ? (
          <Feedback
            feedback={feedback}
            busy={busy}
            onNext={
              pending
                ? () => {
                    setSummary(pending);
                    setFeedback(null);
                  }
                : next
            }
            finished={!!pending}
          />
        ) : view.question ? (
          <QuestionView
            key={`${view.qIndex}`}
            view={view}
            remaining={remaining}
            total={isRush ? 60_000 : total}
            busy={busy}
            onSubmit={submit}
          />
        ) : (
          <div className="m-auto flex flex-col items-center gap-3">
            <p className="font-bold">{t('loading')}</p>
            <button type="button" onClick={next} className="font-bold underline">
              {t('continue')}
            </button>
          </div>
        )}
        {!summary && !feedback && (
          <button
            type="button"
            onClick={() => confirm(t('quitConfirm')) && void finishNow()}
            className="mt-auto self-center text-sm font-bold opacity-70 hover:opacity-100"
          >
            {t('quit')}
          </button>
        )}
      </main>
    </div>
  );
}

function QuestionView({
  view,
  remaining,
  total,
  busy,
  onSubmit,
}: {
  view: SoloView;
  remaining: number;
  total: number;
  busy: boolean;
  onSubmit: (a: Omit<AnswerPayload, 'qIndex'>) => void;
}) {
  const t = useTranslations('solo');
  const q = view.question!;
  const untimed = view.endsAt === null;
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="flex flex-1 flex-col gap-4"
    >
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-black/30 px-3 py-1 text-sm font-extrabold">
          {view.total
            ? t('questionOf', { current: view.qIndex + 1, total: view.total })
            : t('rushCount', { n: view.qIndex + 1 })}
        </span>
        {!untimed && (
          <TimerRing remainingMs={remaining} totalMs={total} size={64} className="ml-auto" />
        )}
      </div>
      {q.type !== 'FILL_BLANK' && (
        <h1 className="rounded-2xl bg-white/95 px-4 py-4 text-center font-display text-xl leading-tight font-extrabold text-[#1a1640] md:text-2xl">
          {q.prompt}
        </h1>
      )}
      {q.type === 'REVEAL_IMAGE' && q.media && q.extra?.kind === 'reveal' ? (
        <RevealImage
          url={q.media.url}
          tiles={q.extra.tiles}
          progress={1 - remaining / total}
          seed={q.prompt}
        />
      ) : (
        q.media && <MediaView media={q.media} className="mx-auto w-full max-w-xl" />
      )}
      <div className="flex-1">
        {q.extra && q.extra.kind !== 'reveal' ? (
          <TypePad question={q} disabled={busy} onSubmit={onSubmit} />
        ) : (
          <AnswerPad question={q} showText disabled={busy} onSubmit={onSubmit} />
        )}
      </div>
    </motion.div>
  );
}

/** Tras responder: ¿acerté?, la solución y la explicación. */
function Feedback({
  feedback,
  busy,
  onNext,
  finished,
}: {
  feedback: { q: PublicQuestion; res: AnswerResponse };
  busy: boolean;
  onNext: () => void;
  finished: boolean;
}) {
  const t = useTranslations('solo');
  const { q, res } = feedback;
  const s = res.solution;
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => nextRef.current?.focus(), []);

  let solution: React.ReactNode = null;
  if (s.kind === 'options') {
    solution = (
      <ul className="flex flex-col gap-1">
        {q.options
          .filter((o) => s.optionIds.includes(o.id))
          .map((o) => (
            <li key={o.id} className="rounded-xl bg-[#12a150] px-3 py-2 font-bold">
              ✅ {o.text}
            </li>
          ))}
      </ul>
    );
  } else if (s.kind === 'text') {
    solution = <p className="font-bold">✅ {s.accepted.join(' · ')}</p>;
  } else if (s.kind === 'order' && q.extra?.kind === 'order') {
    const items = q.extra.items;
    solution = (
      <ol className="flex flex-col gap-1">
        {s.ids.map((id, i) => (
          <li key={id} className="rounded-xl bg-white/15 px-3 py-1.5 font-bold">
            {i + 1}. {items.find((x) => x.id === id)?.text}
          </li>
        ))}
      </ol>
    );
  } else if (s.kind === 'match') {
    solution = (
      <ul className="flex flex-col gap-1">
        {s.pairs.map((p) => (
          <li key={p.left} className="rounded-xl bg-white/15 px-3 py-1.5 font-bold">
            {p.left} ⟷ {p.right}
          </li>
        ))}
      </ul>
    );
  } else if (s.kind === 'slider') {
    solution = (
      <p className="font-bold">
        ✅ {s.value} (±{s.tolerance})
      </p>
    );
  } else if (s.kind === 'blanks') {
    solution = <p className="font-bold">✅ {s.answers.join(' · ')}</p>;
  } else if (s.kind === 'pin' && q.extra?.kind === 'pin') {
    solution = (
      <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element -- imagen del autor del quiz */}
        <img src={q.extra.imageUrl} alt="" className="block w-full" />
        <span
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-[#12a150]/40"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: `${s.radius * 2}%`,
            height: `${s.radius * 2}%`,
          }}
          aria-hidden="true"
        />
      </div>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="m-auto flex w-full max-w-md flex-col items-center gap-4 text-center"
      aria-live="polite"
    >
      <motion.span
        initial={{ scale: 0, rotate: -40 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 12 }}
        className={cn(
          'grid size-24 place-items-center rounded-full shadow-2xl',
          res.correct ? 'bg-[#12a150]' : res.correctness > 0 ? 'bg-[#fb923c]' : 'bg-[#e5484d]',
        )}
      >
        {res.correct ? (
          <Check className="size-14" strokeWidth={4} />
        ) : (
          <X className="size-14" strokeWidth={4} />
        )}
      </motion.span>
      <h1 className="font-display text-3xl font-extrabold">
        {res.correct ? t('right') : res.correctness > 0 ? t('partial') : t('wrong')}
      </h1>
      {res.points > 0 && (
        <p className="font-display text-4xl font-black text-primary">+{res.points}</p>
      )}
      <div className="w-full rounded-2xl bg-black/30 p-4 text-left">
        <p className="mb-2 text-xs font-black tracking-wider uppercase opacity-80">
          {t('solution')}
        </p>
        {solution}
        {res.explanation && <p className="mt-3 text-sm">💡 {res.explanation}</p>}
      </div>
      <button
        ref={nextRef}
        type="button"
        onClick={onNext}
        disabled={busy}
        className="h-14 w-full cursor-pointer rounded-2xl bg-primary font-display text-xl font-extrabold text-primary-ink shadow-[0_6px_0_0_var(--primary-shadow)] active:translate-y-1 active:shadow-none disabled:opacity-60"
      >
        {finished ? t('seeResult') : t('next')}
      </button>
    </motion.section>
  );
}

function SummaryView({
  summary,
  view,
  busy,
  onAgain,
}: {
  summary: SoloSummary;
  view: SoloView;
  busy: boolean;
  onAgain: () => void;
}) {
  const t = useTranslations('solo');
  const isRush = summary.mode === 'RUSH';
  const nextLevel =
    summary.mode === 'ADVENTURE' && view.ref && (summary.stars ?? 0) > 0
      ? parseLevelKey(view.ref)
      : null;
  // Reto diario, desafío y tarea: los intentos se gestionan desde su propia página
  const once =
    summary.mode === 'DAILY' || summary.mode === 'CHALLENGE' || summary.mode === 'ASSIGNMENT';
  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      className="m-auto flex w-full max-w-md flex-col items-center gap-4 text-center"
    >
      <p className="text-sm font-black tracking-widest uppercase opacity-80">{t('finished')}</p>
      {summary.stars !== undefined && (
        <p className="text-6xl" aria-label={t('stars', { count: summary.stars })}>
          {[1, 2, 3].map((n) => (
            <motion.span
              key={n}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2 + n * 0.25, type: 'spring', stiffness: 400, damping: 10 }}
              className={cn('inline-block', n > (summary.stars ?? 0) && 'opacity-25 grayscale')}
            >
              ⭐
            </motion.span>
          ))}
        </p>
      )}
      <h1 className="font-display text-6xl font-black">
        {isRush ? `⚡ ${summary.score}` : summary.score.toLocaleString()}
      </h1>
      <p className="text-lg font-bold">
        {isRush
          ? t('rushResult', { correct: summary.correct, answered: summary.answered })
          : t('result', { correct: summary.correct, total: summary.total })}
      </p>
      {summary.personalBest && (
        <p className="rounded-full bg-[#ffe14d] px-4 py-1.5 font-extrabold text-[#1a1640]">
          🏆 {t('personalBest')}
        </p>
      )}
      {summary.position && (
        <p className="font-bold">{t('position', { position: summary.position })}</p>
      )}
      {summary.assignment && (
        <div
          className={cn(
            'w-full rounded-2xl p-4 text-center',
            summary.assignment.passed ? 'bg-[#12a150]/30' : 'bg-black/30',
          )}
        >
          <p className="font-display text-4xl font-black">{summary.assignment.percent}%</p>
          <p className="font-bold">
            {summary.assignment.passed
              ? t('assignmentPassed')
              : t('assignmentFailed', { score: summary.assignment.passingScore })}
          </p>
          {summary.assignment.certificateId && (
            <Link
              href={`/certificado/${summary.assignment.certificateId}`}
              className="mt-3 inline-block rounded-2xl bg-[#ffe14d] px-5 py-2 font-extrabold text-[#1a1640]"
            >
              🏅 {t('seeCertificate')}
            </Link>
          )}
        </div>
      )}
      <RewardsSummary outcome={summary.progress} />
      <div className="mt-2 flex w-full flex-col gap-2">
        {summary.shareId && summary.mode !== 'ASSIGNMENT' && (
          <ShareResultButton shareId={summary.shareId} />
        )}
        {nextLevel && nextLevel.level < nextLevel.world.levels && (
          <Link
            href="/aventura"
            className="rounded-2xl bg-primary px-6 py-3 font-display text-lg font-extrabold text-primary-ink"
          >
            🗺️ {t('backToMap')}
          </Link>
        )}
        {!once && (
          <button
            type="button"
            onClick={onAgain}
            disabled={busy}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white/90 px-6 py-3 font-display text-lg font-extrabold text-[#1a1640] disabled:opacity-60"
          >
            <RotateCcw className="size-5" /> {t('playAgain')}
          </button>
        )}
        <Link
          href={summary.mode === 'ASSIGNMENT' ? '/clases' : '/solo'}
          className="flex items-center justify-center gap-2 py-2 font-bold underline"
        >
          <Home className="size-4" />{' '}
          {summary.mode === 'ASSIGNMENT' ? t('backToClasses') : t('backToHub')}
        </Link>
      </div>
    </motion.section>
  );
}
