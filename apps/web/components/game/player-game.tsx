'use client';
// Pantalla del jugador (celular): PIN → apodo y avatar → partida. Botones grandes,
// vibración, sonidos, confeti y mensajes divertidos según el resultado.
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { Flame, LogOut, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from 'react';
import {
  getTheme,
  MODE_EMOJI,
  nicknameSchema,
  PLAYER_AVATARS,
  type PlayerResult,
} from '@quiz-rush/shared';
import { LogoMark } from '@/components/ui/logo';
import { ShareResultButton } from '@/components/social/share-result';
import { useCountdown } from '@/hooks/use-countdown';
import { burstConfetti, sideCannons, vibrate } from '@/lib/game/effects';
import { playSfx, preloadSounds } from '@/lib/game/sounds';
import { cn } from '@/lib/utils';
import { AnswerPad, ResultBadge } from './answers';
import { DrawingBoard } from './draw-canvas';
import { EliminatedView, ModeResultInfo, PlayerModeHud, TeamName } from './mode-views';
import { GuessPad, TypePad, VotePad } from './pads';
import { PowerUpBar } from './powerup-bar';
import { ReactionBar } from './reactions';
import { SoundToggle } from './sound-toggle';
import { TimerRing } from './timer-ring';
import { usePlayerGame, type FinalResult } from './use-player-game';

export function PlayerGame({
  initialPin,
  defaultNick,
  signedIn = false,
}: {
  initialPin?: string;
  defaultNick?: string;
  signedIn?: boolean;
}) {
  const t = useTranslations('game');
  const game = usePlayerGame(initialPin, signedIn);
  const { state } = game;
  const theme = getTheme(state.snap?.theme ?? state.gameInfo?.theme);

  useEffect(() => preloadSounds(), []);

  const errorText = (code: string) =>
    t.has(`errors.${code}`) ? t(`errors.${code}` as 'errors.INTERNAL') : t('errors.INTERNAL');

  return (
    <div
      className="relative flex min-h-dvh flex-col overflow-x-hidden text-white"
      style={{ background: `linear-gradient(160deg, ${theme.from}, ${theme.to})` }}
    >
      <header className="flex items-center gap-2 px-4 py-3">
        <Link href="/" aria-label="Quiz_Rush">
          <LogoMark className="size-8" />
        </Link>
        {state.snap && (
          <span className="flex min-w-0 items-center gap-2 rounded-full bg-black/30 px-3 py-1 text-sm font-bold">
            <span aria-hidden="true">{state.snap.me.avatar}</span>
            <span className="truncate">{state.snap.me.nick}</span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {state.snap && (
            <span
              className="rounded-xl bg-black/30 px-3 py-2 font-display font-extrabold tabular-nums"
              aria-label={t('yourScore')}
            >
              {state.snap.me.score.toLocaleString()}
            </span>
          )}
          <SoundToggle />
        </div>
      </header>

      {!state.online && state.step === 'playing' && (
        <p
          role="status"
          className="mx-4 flex items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2 text-sm font-bold"
        >
          <WifiOff className="size-4" /> {t('reconnecting')}
        </p>
      )}

      <main id="contenido" className="flex flex-1 flex-col px-4 pb-4">
        {state.step === 'resuming' && (
          <div className="m-auto flex flex-col items-center gap-3" role="status">
            <LogoMark className="size-16 animate-bounce" />
            <p className="font-bold">{t('connecting')}</p>
          </div>
        )}
        {state.step === 'pin' && (
          <PinStep initialPin={initialPin} onSubmit={game.checkPin} errorText={errorText} />
        )}
        {state.step === 'profile' && (
          <ProfileStep
            quizTitle={state.gameInfo?.quizTitle ?? ''}
            started={!!state.gameInfo?.started}
            defaultNick={defaultNick}
            onSubmit={game.join}
            onBack={game.back}
            errorText={errorText}
          />
        )}
        {state.step === 'playing' && state.snap && <InGame game={game} errorText={errorText} />}
        {state.step === 'kicked' && (
          <EndCard emoji="🚪" title={t('kickedTitle')} text={t('kickedText')} onAgain={game.back} />
        )}
        {state.step === 'ended' && !state.final && (
          <EndCard emoji="🏁" title={t('gameEnded')} onAgain={game.back} />
        )}
        {state.step === 'ended' && state.final && (
          <FinalView final={state.final} onAgain={game.back} shareId={state.snap?.me.id} />
        )}
      </main>
    </div>
  );
}

// ───────────────────────── Entrada ─────────────────────────

function PinStep({
  initialPin,
  onSubmit,
  errorText,
}: {
  initialPin?: string;
  onSubmit: (pin: string) => Promise<void>;
  errorText: (code: string) => string;
}) {
  const t = useTranslations('game');
  const [pin, setPin] = useState(initialPin ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  const submit = async (value = pin) => {
    if (value.length !== 6) {
      setShake((n) => n + 1);
      vibrate([20, 40, 20]);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value);
    } catch (err) {
      setError(errorText((err as Error).message));
      setShake((n) => n + 1);
      vibrate([20, 40, 20]);
    } finally {
      setBusy(false);
    }
  };

  // Llegó desde el QR con el PIN en la URL: se comprueba solo (una vez por PIN)
  const autoSubmit = useEffectEvent((value: string) => void submit(value));
  useEffect(() => {
    if (initialPin?.length !== 6) return;
    const id = setTimeout(() => autoSubmit(initialPin), 300);
    return () => clearTimeout(id);
  }, [initialPin]);

  return (
    <motion.form
      key={shake}
      animate={shake ? { x: [0, -12, 12, -8, 8, 0] } : undefined}
      transition={{ duration: 0.35 }}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void submit();
      }}
      className="m-auto flex w-full max-w-sm flex-col gap-4 rounded-[2rem] bg-white p-6 text-[#1a1640] shadow-2xl"
    >
      <h1 className="text-center font-display text-3xl font-extrabold">{t('enterPin')}</h1>
      <label htmlFor="game-pin" className="sr-only">
        {t('gamePin')}
      </label>
      <input
        id="game-pin"
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="000000"
        aria-invalid={!!error || undefined}
        aria-describedby={error ? 'pin-error' : undefined}
        className="h-20 rounded-2xl border-4 border-[#1a1640]/15 text-center font-display text-5xl font-extrabold tracking-[0.25em] outline-none placeholder:text-[#1a1640]/20 focus:border-[#ff3d9a]"
      />
      {error && (
        <p id="pin-error" role="alert" className="text-center text-sm font-bold text-[#e5484d]">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="h-16 cursor-pointer rounded-2xl bg-accent font-display text-2xl font-extrabold text-accent-ink shadow-[0_6px_0_0_var(--accent-shadow)] active:translate-y-1 active:shadow-none disabled:opacity-60"
      >
        {busy ? '…' : t('enter')}
      </button>
    </motion.form>
  );
}

function ProfileStep({
  quizTitle,
  started,
  defaultNick,
  onSubmit,
  onBack,
  errorText,
}: {
  quizTitle: string;
  started: boolean;
  defaultNick?: string;
  onSubmit: (nick: string, avatar: string) => Promise<void>;
  onBack: () => void;
  errorText: (code: string) => string;
}) {
  const t = useTranslations('game');
  const [nick, setNick] = useState((defaultNick ?? '').slice(0, 16));
  const [avatar, setAvatar] = useState<string>(
    () => PLAYER_AVATARS[Math.floor(Math.random() * PLAYER_AVATARS.length)]!,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = nicknameSchema.safeParse(nick);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message;
      setError(errorText(msg === 'OFFENSIVE' ? 'NICK_OFFENSIVE' : 'NICK_INVALID'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(parsed.data, avatar);
      vibrate([15, 30, 15]);
      playSfx('join');
    } catch (err) {
      setError(errorText((err as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="m-auto flex w-full max-w-sm flex-col gap-4 rounded-[2rem] bg-white p-6 text-[#1a1640] shadow-2xl"
    >
      <p className="text-center text-sm font-bold text-[#5d5a7a]">
        {started ? t('joiningStarted') : t('joining')}
      </p>
      <h1 className="text-center font-display text-2xl leading-tight font-extrabold">
        {quizTitle}
      </h1>
      <motion.span
        key={avatar}
        initial={{ scale: 0.4, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 14 }}
        className="mx-auto text-7xl"
        aria-hidden="true"
      >
        {avatar}
      </motion.span>
      <fieldset>
        <legend className="mb-2 text-sm font-bold">{t('chooseAvatar')}</legend>
        <div className="grid grid-cols-8 gap-1.5">
          {PLAYER_AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAvatar(a)}
              aria-pressed={avatar === a}
              aria-label={a}
              className={cn(
                'grid aspect-square cursor-pointer place-items-center rounded-xl text-2xl',
                avatar === a ? 'bg-[#ff3d9a]/20 ring-2 ring-[#ff3d9a]' : 'bg-[#f3eefb]',
              )}
            >
              {a}
            </button>
          ))}
        </div>
      </fieldset>
      <label htmlFor="nickname" className="text-sm font-bold">
        {t('nickname')}
      </label>
      <input
        id="nickname"
        value={nick}
        onChange={(e) => setNick(e.target.value)}
        maxLength={16}
        autoFocus={!defaultNick}
        autoComplete="nickname"
        aria-invalid={!!error || undefined}
        aria-describedby={error ? 'nick-error' : undefined}
        className="h-14 rounded-2xl border-4 border-[#1a1640]/15 px-4 font-display text-2xl font-extrabold outline-none focus:border-[#ff3d9a]"
      />
      {error && (
        <p id="nick-error" role="alert" className="text-sm font-bold text-[#e5484d]">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="h-16 cursor-pointer rounded-2xl bg-primary font-display text-2xl font-extrabold text-primary-ink shadow-[0_6px_0_0_var(--primary-shadow)] active:translate-y-1 active:shadow-none disabled:opacity-60"
      >
        {busy ? '…' : t('letsGo')}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="cursor-pointer text-sm font-bold text-[#5d5a7a] underline"
      >
        {t('otherPin')}
      </button>
    </form>
  );
}

// ───────────────────────── En partida ─────────────────────────

function InGame({
  game,
  errorText,
}: {
  game: ReturnType<typeof usePlayerGame>;
  errorText: (c: string) => string;
}) {
  const t = useTranslations('game');
  const tp = useTranslations('game.pads');
  const tm = useTranslations('game.modes');
  const { state } = game;
  const snap = state.snap!;
  const mode = snap.settings.mode;
  const fx = state.effects?.qIndex === snap.qIndex ? state.effects : null;
  // +10 s: este jugador tiene su propio final
  const endsAt = snap.phase === 'question' && fx?.endsAt ? fx.endsAt : snap.endsAt;
  const remaining = useCountdown(endsAt, state.offset);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [retry, setRetry] = useState<number | null>(null);
  const answered = state.answeredQ === snap.qIndex;
  const hud = <PlayerModeHud mode={mode} me={snap.me} opponent={state.opponent} />;

  // Llegó el resultado final: pasar a la pantalla de cierre con celebración
  useEffect(() => {
    if (snap.phase === 'podium' && state.final && state.final.rank <= 3) sideCannons(2000);
  }, [snap.phase, state.final]);

  /** Envía la respuesta; devuelve true si el servidor la aceptó. */
  const submit = async (payload: Parameters<typeof game.answer>[0]) => {
    vibrate(25);
    playSfx('pop');
    setAnswerError(null);
    const res = await game.answer(payload);
    if (res.ok) return true;
    if ('retry' in res) {
      // Segunda oportunidad: se avisa y se puede responder otra vez
      setRetry(snap.qIndex);
      vibrate([60, 40, 60]);
      return false;
    }
    if ('wrong' in res) return false;
    if (!['CLOSED', 'TIME_UP'].includes(res.error)) setAnswerError(errorText(res.error));
    return false;
  };

  if (snap.phase === 'lobby') {
    return (
      <div className="m-auto flex flex-col items-center gap-5 text-center">
        <motion.span
          animate={{ y: [0, -16, 0], rotate: [0, -6, 6, 0] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          className="text-8xl"
          aria-hidden="true"
        >
          {snap.me.avatar}
        </motion.span>
        <h1 className="font-display text-3xl font-extrabold">{t('youreIn')}</h1>
        {mode !== 'CLASSIC' && (
          <p className="rounded-full bg-black/30 px-4 py-1.5 font-bold">
            {MODE_EMOJI[mode]} {tm(`${mode}.name`)}
          </p>
        )}
        <p className="max-w-xs text-lg opacity-90">{t('lookAtScreen')}</p>
        <ReactionBar socket={game.socket} />
        <button
          type="button"
          onClick={game.leave}
          className="mt-4 flex cursor-pointer items-center gap-1 text-sm font-bold opacity-75 hover:opacity-100"
        >
          <LogOut className="size-4" /> {t('leave')}
        </button>
      </div>
    );
  }

  if (snap.phase === 'getReady' && snap.question) {
    const seconds = Math.ceil(remaining / 1000);
    const talking = mode === 'TEAMS' && snap.settings.teamTalkSeconds > 0;
    return (
      <div className="m-auto flex flex-col items-center gap-5 text-center">
        {hud}
        <p className="rounded-full bg-black/30 px-4 py-1.5 font-extrabold">
          {t('questionOf', { current: snap.qIndex + 1, total: snap.questionCount })}
        </p>
        {snap.settings.showQuestionOnDevices && (
          <h1 className="font-display text-3xl leading-tight font-extrabold">
            {snap.question.prompt}
          </h1>
        )}
        {snap.drawWord && (
          <p className="rounded-3xl bg-white px-6 py-3 font-display text-2xl font-black text-[#1a1640]">
            🎨 {tp('yourWord')}: <span className="text-[#ff3d9a]">{snap.drawWord}</span>
          </p>
        )}
        <motion.span
          key={seconds}
          initial={{ scale: 2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="font-display text-8xl font-extrabold text-primary"
        >
          {seconds > 0 ? seconds : '⚡'}
        </motion.span>
        <p className="font-bold opacity-90">{talking ? t('teamTalk') : t('getReady')}</p>
      </div>
    );
  }

  const out = snap.me.eliminated && (mode === 'SURVIVAL' || mode === 'TOURNAMENT');
  if ((snap.phase === 'question' || snap.phase === 'vote') && out) {
    return <EliminatedView mode={mode} />;
  }

  if (snap.phase === 'vote') {
    return (
      <VotePad
        candidates={snap.candidates ?? []}
        ownText={state.ownText}
        voted={state.votedQ === snap.qIndex}
        onVote={async (id) => {
          vibrate(25);
          const err = await game.vote(id);
          if (err && !['CLOSED', 'DUPLICATE'].includes(err)) setAnswerError(errorText(err));
        }}
      />
    );
  }

  if (snap.phase === 'question' && snap.question) {
    const q = snap.question;
    const total =
      q.timeLimit * 1000 * (1 + snap.settings.extraTimePercent / 100) + (fx?.endsAt ? 10_000 : 0);
    const isDrawer = q.type === 'DRAW' && !!snap.drawWord;
    if (answered) {
      return (
        <div className="m-auto flex flex-col items-center gap-6 text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
            className="text-7xl"
            aria-hidden="true"
          >
            {q.type === 'DRAW' ? '🎉' : '⚡'}
          </motion.div>
          <h1 className="font-display text-3xl font-extrabold">
            {q.type === 'DRAW' ? tp('guessedIt') : t('answerSent')}
          </h1>
          <p className="opacity-90">{t('waitingOthers')}</p>
          <ReactionBar socket={game.socket} />
        </div>
      );
    }
    const disabled = remaining <= 0;
    return (
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-black/30 px-3 py-1 text-sm font-extrabold">
            {snap.qIndex + 1}/{snap.questionCount}
          </span>
          {hud}
          <TimerRing remainingMs={remaining} totalMs={total} size={64} className="ml-auto" />
        </div>
        {snap.settings.showQuestionOnDevices && q.type !== 'FILL_BLANK' && (
          <h1 className="rounded-2xl bg-white/95 px-4 py-3 text-center font-display text-xl leading-tight font-extrabold text-[#1a1640]">
            {q.prompt}
          </h1>
        )}
        {snap.settings.powerUps && !isDrawer && (
          <PowerUpBar
            powerUps={snap.me.powerUps}
            question={q}
            effects={state.effects}
            onUse={game.activatePowerUp}
            errorText={errorText}
          />
        )}
        {retry === snap.qIndex && (
          <p
            role="status"
            className="rounded-xl bg-[#ffe14d] px-3 py-2 text-center text-sm font-black text-[#1a1640]"
          >
            🔁 {tp('secondChance')}
          </p>
        )}
        {answerError && (
          <p
            role="alert"
            className="rounded-xl bg-[#e5484d] px-3 py-2 text-center text-sm font-bold"
          >
            {answerError}
          </p>
        )}
        <div className="flex-1">
          {q.type === 'DRAW' ? (
            isDrawer ? (
              <div className="flex flex-col gap-2">
                <p className="text-center font-display text-xl font-black">
                  🎨 {tp('drawThis')}: <span className="text-primary">{snap.drawWord}</span>
                </p>
                <DrawingBoard
                  onStroke={game.sendStroke}
                  onClear={game.clearDrawing}
                  disabled={remaining <= 0}
                />
              </div>
            ) : (
              <GuessPad
                strokes={state.strokes}
                wordLength={q.extra?.kind === 'draw' ? q.extra.wordLength : 0}
                drawer={q.extra?.kind === 'draw' ? (q.extra.drawer?.nick ?? null) : null}
                disabled={disabled}
                onGuess={(text) => submit({ text })}
              />
            )
          ) : q.extra && q.extra.kind !== 'reveal' ? (
            <TypePad
              key={`${snap.qIndex}-${retry}`}
              question={q}
              disabled={disabled}
              onSubmit={(p) => void submit(p)}
            />
          ) : (
            <AnswerPad
              key={`${snap.qIndex}-${retry}`}
              question={q}
              showText={snap.settings.showQuestionOnDevices}
              disabled={disabled}
              hide={fx?.hide}
              onSubmit={(p) => void submit(p)}
            />
          )}
        </div>
      </div>
    );
  }

  if ((snap.phase === 'reveal' || snap.phase === 'leaderboard') && state.result) {
    return <ResultView result={state.result} phase={snap.phase} />;
  }

  if (snap.phase === 'reveal' || snap.phase === 'leaderboard') {
    return <p className="m-auto font-bold">{t('waitingResult')}</p>;
  }

  if ((snap.phase === 'podium' || snap.phase === 'ended') && state.final) {
    return <FinalView final={state.final} shareId={snap.me.id} />;
  }

  return <p className="m-auto font-bold">{t('lookAtScreen')}</p>;
}

/** Número que cuenta desde 0 (los puntos "vuelan" al marcador). */
function CountUp({ value, className }: { value: number; className?: string }) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => `+${Math.round(v).toLocaleString()}`);
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.9, ease: 'easeOut' });
    return () => controls.stop();
  }, [mv, value]);
  return <motion.span className={className}>{rounded}</motion.span>;
}

function ResultView({ result, phase }: { result: PlayerResult; phase: string }) {
  const t = useTranslations('game');
  const tm = useTranslations('game.messages');
  const format = useFormatter();
  const celebrated = useRef(false);
  const onFire = result.correct && result.streak >= 3;

  // Efectos al recibir el resultado (una sola vez)
  useEffect(() => {
    if (celebrated.current || phase !== 'reveal') return;
    celebrated.current = true;
    if (result.messageKey === 'poll' || result.messageKey === 'drawer') return;
    if (result.correct) {
      playSfx('correct');
      vibrate(result.streak >= 3 ? [30, 40, 30, 40, 60] : [40]);
      burstConfetti(result.streak >= 3 ? 1.6 : 0.8);
    } else {
      playSfx('wrong');
      vibrate([120]);
    }
  }, [phase, result]);

  const climb = result.prevRank !== null ? result.prevRank - result.rank : 0;

  return (
    <motion.div
      className="m-auto flex w-full max-w-sm flex-col items-center gap-4 text-center"
      // La pantalla tiembla con las rachas
      animate={onFire ? { x: [0, -10, 10, -7, 7, -3, 0] } : undefined}
      transition={{ duration: 0.5, delay: 0.3 }}
    >
      {result.messageKey !== 'poll' && result.messageKey !== 'drawer' && (
        <ResultBadge correct={result.correct} />
      )}
      <h1 className="font-display text-4xl font-extrabold">{tm(result.messageKey)}</h1>
      {result.points > 0 && (
        <motion.div
          initial={{ y: 0, scale: 1 }}
          animate={{ y: [0, 0, -12], scale: [1, 1.15, 1] }}
          transition={{ duration: 1.4, times: [0, 0.7, 1] }}
        >
          <CountUp
            value={result.points}
            className="font-display text-5xl font-extrabold text-primary"
          />
          {result.streakBonus > 0 && (
            <p className="text-sm font-bold opacity-90">
              {t('streakBonus', { points: result.streakBonus })}
            </p>
          )}
        </motion.div>
      )}
      {result.streak >= 2 && (
        <p className="flex items-center gap-1 rounded-full bg-[#ff3d9a] px-4 py-1.5 font-extrabold">
          <Flame className="size-5" /> {t('streak', { count: result.streak })}
        </p>
      )}
      <ModeResultInfo result={result} />
      <div className="w-full rounded-3xl bg-black/30 p-4">
        <p className="text-sm font-bold opacity-80">{t('yourPosition')}</p>
        <p className="font-display text-5xl font-extrabold">
          #{result.rank}
          <span className="text-xl opacity-70"> / {result.players}</span>
        </p>
        {climb > 0 && (
          <p className="font-bold text-[#a3e635]">▲ {t('climbed', { count: climb })}</p>
        )}
        <p className="mt-1 font-bold tabular-nums">
          {t('totalPoints', { points: format.number(result.total) })}
        </p>
      </div>
    </motion.div>
  );
}

function FinalView({
  final,
  onAgain,
  shareId,
}: {
  final: FinalResult;
  onAgain?: () => void;
  /** Id del jugador: enlace para compartir el resultado */
  shareId?: string;
}) {
  const t = useTranslations('game');
  const tm = useTranslations('game.messages');
  const format = useFormatter();
  const medal = ['🥇', '🥈', '🥉'][final.rank - 1];
  return (
    <div className="m-auto flex w-full max-w-sm flex-col items-center gap-4 text-center">
      <motion.span
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 12 }}
        className="text-8xl"
        aria-hidden="true"
      >
        {medal ?? '🎮'}
      </motion.span>
      <h1 className="font-display text-4xl font-extrabold">{tm(final.messageKey)}</h1>
      <p className="font-display text-6xl font-extrabold">
        #{final.rank}
        <span className="text-2xl opacity-70"> / {final.players}</span>
      </p>
      <p className="text-xl font-bold">
        {t('totalPoints', { points: format.number(final.score) })}
      </p>
      {final.team && (
        <p className="rounded-full bg-black/30 px-4 py-1.5 font-bold">
          <TeamName index={final.team.index} /> · #{final.team.rank}
        </p>
      )}
      <div className="mt-4 flex flex-col gap-2">
        {shareId && <ShareResultButton shareId={shareId} />}
        <Link
          href="/biblioteca"
          className="rounded-2xl bg-primary px-6 py-3 font-display text-lg font-extrabold text-primary-ink"
        >
          {t('exploreMore')}
        </Link>
        {onAgain && (
          <button
            type="button"
            onClick={onAgain}
            className="cursor-pointer text-sm font-bold underline opacity-80"
          >
            {t('playAnother')}
          </button>
        )}
      </div>
    </div>
  );
}

function EndCard({
  emoji,
  title,
  text,
  onAgain,
}: {
  emoji: string;
  title: string;
  text?: string;
  onAgain: () => void;
}) {
  const t = useTranslations('game');
  return (
    <div className="m-auto flex max-w-sm flex-col items-center gap-3 text-center">
      <span className="text-7xl" aria-hidden="true">
        {emoji}
      </span>
      <h1 className="font-display text-3xl font-extrabold">{title}</h1>
      {text && <p className="opacity-90">{text}</p>}
      <button
        type="button"
        onClick={onAgain}
        className="mt-3 cursor-pointer rounded-2xl bg-primary px-6 py-3 font-display text-lg font-extrabold text-primary-ink"
      >
        {t('playAnother')}
      </button>
    </div>
  );
}
