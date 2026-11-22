'use client';
// Pantalla del anfitrión / proyector. Pensada para verse en grande: textos enormes,
// temporizador visible, contador de respuestas, reacciones flotantes y podio animado.
// En modo espectador muestra lo mismo pero sin controles.
import { AnimatePresence, motion } from 'motion/react';
import {
  ExternalLink,
  Lock,
  LockOpen,
  Maximize,
  Play,
  Settings2,
  SkipForward,
  Square,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { InviteFriendsButton } from '@/components/social/invite-friends';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  getTheme,
  MODE_EMOJI,
  type GameSettings,
  type HostSnapshot,
  type Stroke,
} from '@quiz-rush/shared';
import { LogoMark } from '@/components/ui/logo';
import { useCountdown } from '@/hooks/use-countdown';
import { playMusic, playSfx, preloadSounds, setMusicRate, stopMusic } from '@/lib/game/sounds';
import { cn } from '@/lib/utils';
import { Distribution, ScreenAnswers } from './answers';
import { Leaderboard } from './leaderboard';
import { BossMini, ModeBoard, ModePicker, PodiumModeBanner, teamInfo } from './mode-views';
import { RevealExtraView, ScreenQuestionExtra, ScreenVote } from './type-views';
import { Podium } from './podium';
import { ReactionsLayer } from './reactions';
import { SoundToggle } from './sound-toggle';
import { TimerRing } from './timer-ring';
import { useScreenGame, type ScreenMode } from './use-screen-game';

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export function ScreenGame({ mode, quizId }: { mode: ScreenMode; quizId?: string }) {
  const t = useTranslations('game');
  const game = useScreenGame(mode);
  const isHost = mode.kind === 'host';
  const { snap } = game;

  useEffect(() => preloadSounds(), []);

  // Música de fondo según la fase
  useEffect(() => {
    if (!snap) return;
    if (snap.phase === 'lobby') playMusic('lobby');
    else if (snap.phase === 'question' || snap.phase === 'vote') playMusic('question');
    else if (snap.phase === 'reveal') {
      stopMusic();
      playSfx('reveal');
    } else if (snap.phase !== 'getReady') stopMusic();
    return undefined;
  }, [snap?.phase, snap?.qIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stopMusic(), []);

  /** Texto traducido de un código de error del servidor. */
  const errorText = (code: string | null) =>
    code && t.has(`errors.${code}`)
      ? t(`errors.${code}` as 'errors.INTERNAL')
      : t('errors.INTERNAL');

  /** Comando del anfitrión con aviso de error traducido. */
  const run = async (event: string, data?: unknown) => {
    const error = await game.command(event, data);
    if (error) toast.error(errorText(error));
    return error;
  };

  // Atajos de teclado del anfitrión: Espacio / Enter / → para avanzar
  useEffect(() => {
    if (!isHost || !snap) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, button, a, dialog')) return;
      if (![' ', 'Enter', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      const event =
        snap.phase === 'lobby'
          ? 'host:start'
          : snap.phase === 'question' || snap.phase === 'getReady' || snap.phase === 'vote'
            ? 'host:skip'
            : snap.phase === 'reveal' || snap.phase === 'leaderboard'
              ? 'host:next'
              : null;
      if (event) void game.command(event).then((err) => err && toast.error(errorText(err)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const theme = getTheme(snap?.theme);

  if (game.status === 'error' && !snap) {
    return (
      <FullScreen theme={theme}>
        <div className="m-auto max-w-md text-center text-white">
          <p className="text-6xl" aria-hidden="true">
            😵
          </p>
          <h1 className="mt-4 text-3xl font-extrabold">{errorText(game.error)}</h1>
          <Link href="/biblioteca" className="mt-6 inline-block font-bold text-primary underline">
            {t('backToLibrary')}
          </Link>
        </div>
      </FullScreen>
    );
  }

  if (!snap) {
    return (
      <FullScreen theme={theme}>
        <div className="m-auto flex flex-col items-center gap-4 text-white" role="status">
          <LogoMark className="size-20 animate-bounce" />
          <p className="text-xl font-bold">{t('connecting')}</p>
        </div>
      </FullScreen>
    );
  }

  return (
    <FullScreen theme={theme}>
      <ReactionsLayer socket={game.socket} />
      {game.status === 'reconnecting' && (
        <p
          role="status"
          className="fixed top-3 left-1/2 z-50 -translate-x-1/2 rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-ink shadow-lg"
        >
          {t('reconnecting')}
        </p>
      )}

      <header className="relative z-20 flex items-center gap-3 px-5 py-3 text-white">
        <LogoMark className="size-9" />
        <span className="hidden truncate font-display text-lg font-extrabold sm:block">
          {snap.quizTitle}
        </span>
        {snap.phase !== 'lobby' && (
          <span className="rounded-full bg-black/30 px-3 py-1 text-sm font-bold">
            PIN <span className="font-display tracking-widest">{snap.pin}</span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span
            className="flex items-center gap-1.5 rounded-xl bg-black/30 px-3 py-2 font-bold"
            title={t('players')}
          >
            <Users className="size-5" /> {snap.playerCount}
          </span>
          <SoundToggle />
          <button
            type="button"
            onClick={() =>
              (document.fullscreenElement
                ? document.exitFullscreen()
                : document.documentElement.requestFullscreen()
              ).catch(() => {})
            }
            aria-label={t('fullscreen')}
            title={t('fullscreen')}
            className="grid size-11 cursor-pointer place-items-center rounded-xl bg-black/30 hover:bg-black/45"
          >
            <Maximize className="size-5" />
          </button>
        </div>
      </header>

      <main id="contenido" className="relative z-10 flex flex-1 flex-col px-5 pb-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${snap.phase}-${snap.qIndex}`}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.3 }}
            className="flex flex-1 flex-col"
          >
            {snap.phase === 'lobby' && (
              <LobbyView snap={snap} isHost={isHost} run={run} gameId={mode.gameId} />
            )}
            {snap.phase === 'getReady' && <GetReadyView snap={snap} offset={game.offset} />}
            {snap.phase === 'question' && (
              <QuestionView
                snap={snap}
                offset={game.offset}
                cloud={game.cloud}
                strokes={game.strokes}
              />
            )}
            {snap.phase === 'vote' && <VoteView snap={snap} offset={game.offset} />}
            {snap.phase === 'reveal' && <RevealView snap={snap} />}
            {snap.phase === 'leaderboard' && snap.leaderboard && (
              <div className="flex flex-1 flex-col items-center gap-6 pt-4">
                <h1 className="font-display text-4xl font-extrabold text-white md:text-5xl">
                  {snap.settings.mode === 'CLASSIC' ? '🏆' : MODE_EMOJI[snap.settings.mode]}{' '}
                  {snap.settings.mode === 'CLASSIC'
                    ? t('leaderboard')
                    : t(`modes.${snap.settings.mode}.name`)}
                </h1>
                <ModeBoard state={snap.modeState} />
                {/* En los modos de equipo manda el tablero de equipos; en el resto se ve también el ranking */}
                {!['TEAMS', 'TERRITORY', 'RACE', 'TOURNAMENT'].includes(snap.settings.mode) && (
                  <Leaderboard key={snap.qIndex} entries={snap.leaderboard} />
                )}
              </div>
            )}
            {(snap.phase === 'podium' || snap.phase === 'ended') && snap.podium && (
              <div className="flex flex-1 flex-col items-center gap-4 pt-2">
                <h1 className="font-display text-4xl font-extrabold text-white md:text-6xl">
                  {t('podiumTitle')}
                </h1>
                <PodiumModeBanner podium={snap.podium} />
                <Podium data={snap.podium} celebrate={snap.phase === 'podium'} />
              </div>
            )}
            {snap.phase === 'ended' && !snap.podium && (
              <p className="m-auto text-3xl font-extrabold text-white">{t('gameEnded')}</p>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {isHost && snap.phase !== 'lobby' && <HostControls snap={snap} run={run} quizId={quizId} />}
    </FullScreen>
  );
}

function FullScreen({
  theme,
  children,
}: {
  theme: ReturnType<typeof getTheme>;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative flex min-h-dvh flex-col overflow-x-hidden"
      style={{ background: `linear-gradient(140deg, ${theme.from}, ${theme.to})` }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(circle, rgba(255,255,255,.6) 1px, transparent 1.5px) 0 0/44px 44px',
        }}
      />
      {children}
    </div>
  );
}

type Run = (event: string, data?: unknown) => Promise<string | null>;

// ───────────────────────── Sala de espera ─────────────────────────

function LobbyView({
  snap,
  isHost,
  run,
  gameId,
}: {
  snap: HostSnapshot;
  isHost: boolean;
  run: Run;
  gameId: string;
}) {
  const t = useTranslations('game');
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(snap.settings);
  const joinUrl = `${appUrl}/jugar?pin=${snap.pin}`;
  const prevCount = useRef(snap.players.length);

  // Sonido al entrar cada jugador
  useEffect(() => {
    if (snap.players.length > prevCount.current) playSfx('join');
    prevCount.current = snap.players.length;
  }, [snap.players.length]);

  const updateSetting = async (patch: Partial<GameSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    const err = await run('host:settings', patch);
    if (err) setSettings(settings);
  };

  return (
    <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
      <section
        className="flex flex-col items-center gap-4 rounded-[2rem] bg-white p-6 text-[#1a1640] shadow-2xl"
        aria-label={t('howToJoin')}
      >
        <p className="text-center text-lg font-bold">
          {t('joinAt')}{' '}
          <span className="font-extrabold text-accent">
            {appUrl.replace(/^https?:\/\//, '')}/jugar
          </span>
        </p>
        <p className="text-sm font-extrabold tracking-widest text-[#5d5a7a] uppercase">
          {t('gamePin')}
        </p>
        <p
          className="font-display text-5xl font-extrabold tracking-[0.08em] whitespace-nowrap xl:text-6xl"
          aria-label={snap.pin.split('').join(' ')}
        >
          {snap.pin.slice(0, 3)} {snap.pin.slice(3)}
        </p>
        <div className="rounded-2xl border-4 border-[#1a1640] p-2">
          <QRCodeSVG
            value={joinUrl}
            size={180}
            fgColor="#1a1640"
            marginSize={1}
            aria-label={t('qrLabel')}
          />
        </div>
        <p className="text-center text-sm text-[#5d5a7a]">{t('scanToJoin')}</p>
        {isHost && <InviteFriendsButton pin={snap.pin} />}
      </section>

      <section className="flex min-h-0 flex-col gap-4" aria-label={t('players')}>
        <div className="flex flex-wrap items-center gap-3 text-white">
          <h1 className="font-display text-4xl font-extrabold">
            {t('playersWaiting', { count: snap.playerCount })}
          </h1>
          {snap.locked && (
            <span className="flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-sm font-bold">
              <Lock className="size-4" /> {t('locked')}
            </span>
          )}
        </div>

        <ul className="flex flex-1 flex-wrap content-start gap-3 overflow-y-auto rounded-3xl bg-black/20 p-4">
          {snap.players.length === 0 && (
            <li className="m-auto flex flex-col items-center gap-2 py-10 text-center text-white/80">
              <span className="animate-float text-6xl" aria-hidden="true">
                👀
              </span>
              <span className="text-lg font-bold">{t('waitingForPlayers')}</span>
            </li>
          )}
          <AnimatePresence>
            {snap.players.map((p) => (
              <motion.li
                key={p.id}
                layout
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 18 }}
              >
                <button
                  type="button"
                  disabled={!isHost}
                  onClick={() =>
                    isHost &&
                    confirm(t('kickConfirm', { nick: p.nick })) &&
                    void run('host:kick', { playerId: p.id })
                  }
                  className="group flex items-center gap-2 rounded-2xl bg-white px-4 py-2 font-extrabold text-[#1a1640] shadow-[0_4px_0_0_rgba(0,0,0,.25)] enabled:cursor-pointer enabled:hover:bg-[#ffe3e3]"
                  style={
                    p.team !== null && p.team !== undefined
                      ? { boxShadow: `inset 0 -6px 0 ${teamInfo(p.team).color}` }
                      : undefined
                  }
                  aria-label={isHost ? t('kick', { nick: p.nick }) : p.nick}
                >
                  <span className="text-2xl" aria-hidden="true">
                    {p.avatar}
                  </span>
                  <span className="font-display text-lg">{p.nick}</span>
                  {isHost && (
                    <X className="size-4 opacity-0 transition-opacity group-hover:opacity-60" />
                  )}
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>

        {isHost && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void run('host:start')}
              disabled={snap.playerCount === 0}
              className="flex h-16 cursor-pointer items-center gap-2 rounded-2xl bg-primary px-8 font-display text-2xl font-extrabold text-primary-ink shadow-[0_6px_0_0_var(--primary-shadow)] active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="size-7 fill-current" /> {t('start')}
            </button>
            <button
              type="button"
              onClick={() => void run('host:lock', { locked: !snap.locked })}
              className="flex h-16 cursor-pointer items-center gap-2 rounded-2xl bg-black/30 px-5 font-bold text-white hover:bg-black/45"
            >
              {snap.locked ? <LockOpen className="size-5" /> : <Lock className="size-5" />}
              {snap.locked ? t('unlock') : t('lock')}
            </button>
            <button
              type="button"
              onClick={() => setShowSettings((s) => !s)}
              aria-expanded={showSettings}
              className="flex h-16 cursor-pointer items-center gap-2 rounded-2xl bg-black/30 px-5 font-bold text-white hover:bg-black/45"
            >
              <Settings2 className="size-5" /> {t('settings')}
            </button>
            <a
              href={`/pantalla/${gameId}?k=${snap.spectatorKey}`}
              target="_blank"
              rel="noopener"
              className="flex h-16 items-center gap-2 rounded-2xl bg-black/30 px-5 font-bold text-white hover:bg-black/45"
            >
              <ExternalLink className="size-5" /> {t('openScreen')}
            </a>
            <button
              type="button"
              onClick={() => confirm(t('endConfirm')) && void run('host:end')}
              className="ml-auto flex h-16 cursor-pointer items-center gap-2 rounded-2xl px-4 font-bold text-white/80 hover:bg-black/30"
            >
              <Square className="size-5" /> {t('cancelGame')}
            </button>
          </div>
        )}

        {isHost && (
          <ModePicker settings={settings} onChange={(patch) => void updateSetting(patch)} />
        )}
        {!isHost && snap.settings.mode !== 'CLASSIC' && (
          <p className="self-start rounded-full bg-black/30 px-4 py-2 font-display text-xl font-extrabold text-white">
            {MODE_EMOJI[snap.settings.mode]} {t(`modes.${snap.settings.mode}.name`)}
          </p>
        )}

        {isHost && showSettings && (
          <div className="grid gap-3 rounded-3xl bg-black/30 p-4 text-white sm:grid-cols-2">
            <Toggle
              label={t('speedScoring')}
              help={t('speedScoringHelp')}
              checked={settings.speedEnabled}
              onChange={(v) => void updateSetting({ speedEnabled: v })}
            />
            <Toggle
              label={t('showOnDevices')}
              help={t('showOnDevicesHelp')}
              checked={settings.showQuestionOnDevices}
              onChange={(v) => void updateSetting({ showQuestionOnDevices: v })}
            />
            <Toggle
              label={t('lateJoin')}
              checked={settings.allowLateJoin}
              onChange={(v) => void updateSetting({ allowLateJoin: v })}
            />
            <label className="flex flex-col gap-1 text-sm font-bold">
              {t('extraTime')} (+{settings.extraTimePercent}%)
              <input
                type="range"
                min={0}
                max={100}
                step={25}
                value={settings.extraTimePercent}
                onChange={(e) => void updateSetting({ extraTimePercent: Number(e.target.value) })}
                className="accent-[#ffe14d]"
              />
            </label>
          </div>
        )}
      </section>
    </div>
  );
}

function Toggle({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-5 accent-[#ffe14d]"
      />
      <span>
        <span className="block font-bold">{label}</span>
        {help && <span className="block text-xs opacity-75">{help}</span>}
      </span>
    </label>
  );
}

// ───────────────────────── Preguntas ─────────────────────────

function GetReadyView({ snap, offset }: { snap: HostSnapshot; offset: number }) {
  const t = useTranslations('game');
  const remaining = useCountdown(snap.endsAt, offset);
  const seconds = Math.ceil(remaining / 1000);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (seconds === last.current) return;
    last.current = seconds;
    playSfx(seconds > 0 ? 'countdown' : 'go');
  }, [seconds]);

  if (!snap.question) return null;
  return (
    <div className="m-auto flex max-w-5xl flex-col items-center gap-8 text-center text-white">
      <p className="rounded-full bg-black/30 px-5 py-2 text-xl font-extrabold">
        {t('questionOf', { current: snap.qIndex + 1, total: snap.questionCount })}
      </p>
      <h1 className="font-display text-4xl leading-tight font-extrabold md:text-6xl">
        {snap.question.prompt}
      </h1>
      <AnimatePresence mode="popLayout">
        <motion.span
          key={seconds}
          initial={{ scale: 2.5, opacity: 0, rotate: -15 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 0.3, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          className="font-display text-9xl font-extrabold text-primary drop-shadow-[0_8px_0_rgba(0,0,0,.3)]"
        >
          {seconds > 0 ? seconds : '⚡'}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

function QuestionView({
  snap,
  offset,
  cloud,
  strokes,
}: {
  snap: HostSnapshot;
  offset: number;
  cloud: [string, number][];
  strokes: Stroke[];
}) {
  const t = useTranslations('game');
  const q = snap.question;
  const remaining = useCountdown(snap.endsAt, offset);
  const total = q ? q.timeLimit * 1000 * (1 + snap.settings.extraTimePercent / 100) : 1;
  const seconds = Math.ceil(remaining / 1000);
  const last = useRef<number | null>(null);

  // Últimos 5 segundos: tic-tac y la música acelera
  useEffect(() => {
    if (seconds === last.current) return;
    last.current = seconds;
    if (seconds <= 5 && seconds > 0) {
      playSfx('tick');
      setMusicRate(1.25);
    } else setMusicRate(1);
  }, [seconds]);

  if (!q) return null;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5">
      <div className="flex items-center gap-4 text-white">
        <span className="rounded-full bg-black/30 px-4 py-1.5 font-extrabold">
          {t('questionOf', { current: snap.qIndex + 1, total: snap.questionCount })}
        </span>
        <BossMini state={snap.modeState} />
        <div className="ml-auto flex items-center gap-4">
          <div className="text-right" aria-live="polite">
            <p className="font-display text-4xl leading-none font-extrabold tabular-nums">
              {snap.answered}
            </p>
            <p className="text-sm font-bold opacity-80">{t('answers')}</p>
          </div>
          <TimerRing remainingMs={remaining} totalMs={total} size={104} />
        </div>
      </div>
      <h1 className="rounded-3xl bg-white/95 px-6 py-5 text-center font-display text-3xl leading-tight font-extrabold text-[#1a1640] shadow-xl md:text-5xl">
        {q.prompt}
      </h1>
      {q.type === 'REVEAL_IMAGE' ? (
        <ScreenQuestionExtra
          question={q}
          progress={1 - remaining / total}
          cloud={cloud}
          strokes={strokes}
        />
      ) : (
        q.media && <QuestionMedia media={q.media} />
      )}
      {q.extra && q.extra.kind !== 'reveal' ? (
        <div className="flex flex-1 flex-col">
          <ScreenQuestionExtra
            question={q}
            progress={1 - remaining / total}
            cloud={cloud}
            strokes={strokes}
          />
        </div>
      ) : (
        <div className="mt-auto">
          <ScreenAnswers question={q} reveal={null} />
        </div>
      )}
    </div>
  );
}

function RevealView({ snap }: { snap: HostSnapshot }) {
  const t = useTranslations('game');
  const q = snap.question;
  const r = snap.reveal;
  if (!q || !r) return null;
  const pct = r.answered ? Math.round((r.correctCount / r.answered) * 100) : 0;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5">
      <h1 className="rounded-3xl bg-white/95 px-6 py-4 text-center font-display text-2xl leading-tight font-extrabold text-[#1a1640] shadow-xl md:text-4xl">
        {q.prompt}
      </h1>
      {r.extra ? (
        <>
          {q.type === 'REVEAL_IMAGE' && q.media && <QuestionMedia media={q.media} />}
          <RevealExtraView extra={r.extra} prompt={q.prompt} />
          {!['WORD_CLOUD', 'OPEN_VOTE', 'DRAW', 'ORDER', 'MATCH'].includes(q.type) && (
            <p className="text-center text-xl font-extrabold text-white">
              {t('correctSummary', { correct: r.correctCount, answered: r.answered, pct })}
            </p>
          )}
        </>
      ) : (
        <>
          {q.type === 'REVEAL_IMAGE' && q.media && <QuestionMedia media={q.media} />}
          <Distribution question={q} reveal={r} />
          {q.type !== 'POLL' && (
            <p className="text-center text-xl font-extrabold text-white">
              {t('correctSummary', { correct: r.correctCount, answered: r.answered, pct })}
            </p>
          )}
          <ScreenAnswers question={q} reveal={r} />
        </>
      )}
      <ModeBoardOnReveal snap={snap} />
      {r.explanation && (
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="rounded-2xl bg-black/30 px-5 py-3 text-center text-lg text-white"
        >
          💡 {r.explanation}
        </motion.p>
      )}
    </div>
  );
}

/** Jefe final: la barra de vida también se ve al revelar (el golpe es parte del espectáculo). */
function ModeBoardOnReveal({ snap }: { snap: HostSnapshot }) {
  if (snap.modeState?.mode !== 'BOSS') return null;
  return (
    <div className="flex justify-center">
      <BossMini state={snap.modeState} />
    </div>
  );
}

/** Votación de la pregunta abierta. */
function VoteView({ snap, offset }: { snap: HostSnapshot; offset: number }) {
  const remaining = useCountdown(snap.endsAt, offset);
  if (!snap.question) return null;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5">
      <div className="flex items-center gap-4 text-white">
        <h1 className="flex-1 rounded-3xl bg-white/95 px-6 py-4 text-center font-display text-2xl leading-tight font-extrabold text-[#1a1640] shadow-xl md:text-4xl">
          {snap.question.prompt}
        </h1>
        <TimerRing remainingMs={remaining} totalMs={20_000} size={96} />
      </div>
      <ScreenVote candidates={snap.candidates ?? []} />
    </div>
  );
}

function QuestionMedia({ media }: { media: NonNullable<HostSnapshot['question']>['media'] }) {
  if (!media) return null;
  if (media.kind === 'youtube') {
    const id = media.url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/)?.[1];
    return id ? (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0${media.start ? `&start=${media.start}` : ''}`}
        title="YouTube"
        allow="autoplay; encrypted-media"
        className="mx-auto aspect-video w-full max-w-2xl rounded-3xl"
      />
    ) : null;
  }
  if (media.kind === 'audio')
    return <audio src={media.url} autoPlay controls className="mx-auto w-full max-w-xl" />;
  // Imágenes de autor (URLs externas arbitrarias): <img> directo, sin optimizador de Next
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={media.url}
      alt=""
      className="mx-auto max-h-[32vh] rounded-3xl object-contain shadow-xl"
    />
  );
}

// ───────────────────────── Controles del anfitrión ─────────────────────────

function HostControls({ snap, run, quizId }: { snap: HostSnapshot; run: Run; quizId?: string }) {
  const t = useTranslations('game');
  const last = snap.qIndex >= snap.questionCount - 1;
  const btn =
    'font-display flex h-14 cursor-pointer items-center gap-2 rounded-2xl px-6 text-xl font-extrabold shadow-[0_5px_0_0_rgba(0,0,0,.3)] active:translate-y-1 active:shadow-none';
  return (
    <nav
      className="relative z-20 flex items-center justify-end gap-2 px-5 pb-5"
      aria-label={t('controls')}
    >
      {snap.phase !== 'podium' && snap.phase !== 'ended' && (
        <button
          type="button"
          onClick={() => confirm(t('endConfirm')) && void run('host:end')}
          className="mr-auto flex h-12 cursor-pointer items-center gap-2 rounded-xl px-4 font-bold text-white/80 hover:bg-black/30"
        >
          <Square className="size-4" /> {t('endGame')}
        </button>
      )}
      {(snap.phase === 'question' || snap.phase === 'getReady' || snap.phase === 'vote') && (
        <button
          type="button"
          onClick={() => void run('host:skip')}
          className={cn(btn, 'bg-white/90 text-[#1a1640]')}
        >
          <SkipForward className="size-5" /> {t('skip')}
        </button>
      )}
      {(snap.phase === 'reveal' || snap.phase === 'leaderboard') && (
        <button
          type="button"
          onClick={() => void run('host:next')}
          className={cn(btn, 'bg-primary text-primary-ink')}
          autoFocus
        >
          {snap.phase === 'reveal' && last
            ? `🏆 ${t('showPodium')}`
            : snap.phase === 'reveal'
              ? t('showLeaderboard')
              : t('nextQuestion')}
          <SkipForward className="size-5" />
        </button>
      )}
      {(snap.phase === 'podium' || snap.phase === 'ended') && (
        <Link
          href={`/informes/partida/${snap.gameId}`}
          className={cn(btn, 'bg-white/90 text-[#1a1640]')}
        >
          📊 {t('seeReport')}
        </Link>
      )}
      {(snap.phase === 'podium' || snap.phase === 'ended') && quizId && (
        <Link href={`/quiz/${quizId}`} className={cn(btn, 'bg-primary text-primary-ink')}>
          {t('finish')}
        </Link>
      )}
    </nav>
  );
}
