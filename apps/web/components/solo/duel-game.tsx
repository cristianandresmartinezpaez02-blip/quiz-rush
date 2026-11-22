'use client';
// Duelo 1 contra 1: buscar rival (o RushBot si nadie aparece), retar a un amigo con un código,
// responder las mismas preguntas y usar "congelar" para frenar al rival 3 segundos.
import { AnimatePresence, motion } from 'motion/react';
import { Snowflake, Swords, Users, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  DUEL_MATCH_TIMEOUT_MS,
  DUEL_QUESTION_SECONDS,
  type DuelSide,
  type DuelView,
} from '@quiz-rush/shared';
import { AvatarArt } from '@/components/avatar/avatar-art';
import { AnswerPad } from '@/components/game/answers';
import { TimerRing } from '@/components/game/timer-ring';
import { RewardsSummary } from '@/components/progress/rewards-summary';
import { CopyLink } from '@/components/solo/copy-link';
import { Button } from '@/components/ui/button';
import { useCountdown } from '@/hooks/use-countdown';
import { celebrate, vibrate } from '@/lib/game/effects';
import {
  clockOffset,
  createGameSocket,
  emitAck,
  fetchRealtimeToken,
  type GameClient,
} from '@/lib/game/socket';
import { playSfx, preloadSounds } from '@/lib/game/sounds';
import { cn } from '@/lib/utils';

const STORAGE = 'quizrush:duel';
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

type Stage =
  | { kind: 'menu' }
  | { kind: 'searching'; since: number }
  | { kind: 'hosting'; code: string }
  | { kind: 'playing' };

export function DuelGame({
  initialCode,
  me,
  celebration,
}: {
  initialCode: string | null;
  me: { nick: string; avatar: unknown };
  celebration: string | null;
}) {
  const t = useTranslations('duel');
  const te = useTranslations('errors');
  const router = useRouter();
  // El socket se publica en el estado cuando conecta (null mientras no hay conexión)
  const [socket, setSocket] = useState<GameClient | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: 'menu' });
  const [duel, setDuel] = useState<DuelView | null>(null);
  const [offset, setOffset] = useState(0);
  const [code, setCode] = useState(initialCode ?? '');
  const [busy, setBusy] = useState(false);
  const errorText = (c: string) => (te.has(c) ? te(c as 'INTERNAL') : te('INTERNAL'));
  const autoJoined = useRef(false);

  useEffect(() => {
    preloadSounds();
    const s = createGameSocket();
    s.on('duel:state', (v) => {
      setDuel(v);
      setOffset(clockOffset(v.serverNow));
      setStage({ kind: 'playing' });
      sessionStorage.setItem(STORAGE, v.id);
      if (v.phase === 'finished') sessionStorage.removeItem(STORAGE);
    });
    s.on('duel:frozen', () => {
      vibrate([60, 40, 60]);
      playSfx('wrong');
    });
    s.on('disconnect', () => setSocket(null));
    // Recargó la página a mitad de un duelo: volver a él
    s.on('connect', async () => {
      setSocket(s);
      const duelId = sessionStorage.getItem(STORAGE);
      if (!duelId) return;
      try {
        const token = await fetchRealtimeToken();
        const v = await emitAck<DuelView>(s, 'duel:resume', { duelId, authToken: token ?? '' });
        setDuel(v);
        setOffset(clockOffset(v.serverNow));
        setStage({ kind: 'playing' });
      } catch {
        sessionStorage.removeItem(STORAGE);
      }
    });
    return () => {
      s.removeAllListeners();
      s.disconnect();
    };
  }, []);

  async function find(withCode?: string) {
    if (!socket) return;
    setBusy(true);
    setDuel(null);
    try {
      const token = await fetchRealtimeToken();
      if (!token) throw new Error('UNAUTHORIZED');
      const res = await emitAck<{ status: 'searching' | 'matched' }>(socket, 'duel:find', {
        authToken: token,
        ...(withCode && { code: withCode }),
      });
      if (res.status === 'searching') setStage({ kind: 'searching', since: Date.now() });
    } catch (err) {
      toast.error(errorText((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function host() {
    if (!socket) return;
    setBusy(true);
    try {
      const token = await fetchRealtimeToken();
      if (!token) throw new Error('UNAUTHORIZED');
      const res = await emitAck<{ code: string }>(socket, 'duel:host', { authToken: token });
      setStage({ kind: 'hosting', code: res.code });
    } catch (err) {
      toast.error(errorText((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (socket) await emitAck(socket, 'duel:cancel').catch(() => {});
    setStage({ kind: 'menu' });
  }

  // Llegó con ?code=1234 (enlace de un amigo): se une solo, una vez
  useEffect(() => {
    if (!socket || !initialCode || autoJoined.current) return;
    autoJoined.current = true;
    void find(initialCode);
    // find solo depende del socket ya creado
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, initialCode]);

  if (stage.kind === 'playing' && duel) {
    return (
      <DuelBoard
        duel={duel}
        offset={offset}
        socket={socket}
        celebration={celebration}
        onAgain={() => {
          setDuel(null);
          setStage({ kind: 'menu' });
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 px-4 py-10 text-center">
      <AvatarArt config={me.avatar} size={120} title={me.nick} />
      <h1 className="text-4xl font-extrabold">⚔️ {t('title')}</h1>
      <p className="text-muted">{t('subtitle')}</p>

      {stage.kind === 'menu' && (
        <div className="flex w-full flex-col gap-3">
          <Button size="lg" onClick={() => find()} loading={busy}>
            <Swords className="size-5" /> {t('findRival')}
          </Button>
          <Button size="lg" variant="outline" onClick={host} disabled={busy}>
            <Users className="size-5" /> {t('challengeFriend')}
          </Button>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (/^\d{4}$/.test(code)) void find(code);
            }}
          >
            <label htmlFor="duel-code" className="sr-only">
              {t('codeLabel')}
            </label>
            <input
              id="duel-code"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="0000"
              className="h-12 min-w-0 flex-1 rounded-2xl border-2 border-line bg-surface px-4 text-center font-display text-2xl font-black tracking-[0.3em] outline-none focus:border-accent"
            />
            <Button type="submit" disabled={code.length !== 4 || busy}>
              {t('join')}
            </Button>
          </form>
          <p className="text-sm text-muted">{t('rules')}</p>
        </div>
      )}

      {stage.kind === 'searching' && <Searching since={stage.since} onCancel={cancel} />}

      {stage.kind === 'hosting' && (
        <div className="card flex w-full flex-col items-center gap-3 p-5">
          <p className="font-bold">{t('shareCode')}</p>
          <p
            className="font-display text-6xl font-black tracking-[0.2em]"
            aria-label={stage.code.split('').join(' ')}
          >
            {stage.code}
          </p>
          <CopyLink url={`${appUrl}/duelo?code=${stage.code}`} title={t('title')} />
          <p className="flex items-center gap-2 text-sm text-muted">
            <span className="size-2 animate-ping rounded-full bg-accent" /> {t('waitingFriend')}
          </p>
          <Button variant="ghost" onClick={cancel}>
            <X className="size-4" /> {t('cancel')}
          </Button>
        </div>
      )}
      <Link href="/solo" className="text-sm font-bold underline">
        {t('backToHub')}
      </Link>
    </div>
  );
}

function Searching({ since, onCancel }: { since: number; onCancel: () => void }) {
  const t = useTranslations('duel');
  const remaining = useCountdown(since + DUEL_MATCH_TIMEOUT_MS, 0);
  return (
    <div className="flex flex-col items-center gap-4" role="status">
      <motion.span
        animate={{ rotate: 360 }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
        className="text-6xl"
        aria-hidden="true"
      >
        ⚔️
      </motion.span>
      <p className="text-lg font-bold">{t('searching')}</p>
      <p className="text-sm text-muted">{t('botIn', { seconds: Math.ceil(remaining / 1000) })}</p>
      <Button variant="ghost" onClick={onCancel}>
        <X className="size-4" /> {t('cancel')}
      </Button>
    </div>
  );
}

function SideCard({
  side,
  label,
  align,
  frozen,
}: {
  side: DuelSide;
  label: string;
  align: 'left' | 'right';
  frozen: boolean;
}) {
  const t = useTranslations('duel');
  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 items-center gap-2',
        align === 'right' && 'flex-row-reverse text-right',
      )}
    >
      <div className="relative">
        <AvatarArt config={side.avatar} size={56} />
        {frozen && (
          <span
            className="absolute inset-0 grid place-items-center rounded-full bg-cyan-200/60 text-2xl"
            aria-label={t('frozen')}
          >
            🧊
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-bold opacity-80">
          {label}
          {side.bot && ' 🤖'}
        </p>
        <p className="truncate font-display text-lg font-extrabold">{side.nick}</p>
        <motion.p
          key={side.score}
          initial={{ scale: 1.4 }}
          animate={{ scale: 1 }}
          className="font-display text-2xl font-black tabular-nums"
        >
          {side.score.toLocaleString()}
        </motion.p>
      </div>
      {side.answered && (
        <span
          className="rounded-full bg-[#12a150] px-2 py-0.5 text-xs font-bold"
          aria-label={t('answered')}
        >
          ✔
        </span>
      )}
    </div>
  );
}

function DuelBoard({
  duel,
  offset,
  socket,
  celebration,
  onAgain,
}: {
  duel: DuelView;
  offset: number;
  socket: GameClient | null;
  celebration: string | null;
  onAgain: () => void;
}) {
  const t = useTranslations('duel');
  const te = useTranslations('errors');
  const remaining = useCountdown(duel.endsAt, offset);
  // Congelado: cuenta atrás sincronizada con el servidor (de los dos lados)
  const frozenLeft = useCountdown(duel.me.frozenUntil || null, offset);
  const oppFrozenLeft = useCountdown(duel.opp.frozenUntil || null, offset);
  const celebrated = useRef(false);

  useEffect(() => {
    if (duel.phase === 'reveal' && duel.round) playSfx(duel.round.me.correct ? 'correct' : 'wrong');
    if (duel.phase === 'finished' && duel.result?.outcome === 'win' && !celebrated.current) {
      celebrated.current = true;
      playSfx('fanfare');
      celebrate(celebration);
    }
  }, [duel.phase, duel.qIndex, duel.round, duel.result, celebration]);

  async function answer(optionIds: string[] | undefined) {
    if (!socket || !optionIds) return;
    try {
      const r = await emitAck<{ correct: boolean }>(socket, 'duel:answer', {
        duelId: duel.id,
        qIndex: duel.qIndex,
        answer: { optionIds },
      });
      vibrate(r.correct ? 30 : [80]);
    } catch (err) {
      const c = (err as Error).message;
      if (c !== 'CLOSED' && c !== 'TIME_UP')
        toast.error(te.has(c) ? te(c as 'INTERNAL') : te('INTERNAL'));
    }
  }

  async function freeze() {
    if (!socket) return;
    try {
      await emitAck(socket, 'duel:freeze', { duelId: duel.id, qIndex: duel.qIndex });
      playSfx('pop');
    } catch (err) {
      const c = (err as Error).message;
      toast.error(te.has(c) ? te(c as 'INTERNAL') : te('INTERNAL'));
    }
  }

  const q = duel.question;
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-9rem)] max-w-3xl flex-col gap-4 px-4 py-4">
      <div className="flex items-center gap-3 rounded-3xl bg-gradient-to-r from-accent/80 to-[#4f46e5] p-3 text-white shadow-xl">
        <SideCard side={duel.me} label={t('you')} align="left" frozen={frozenLeft > 0} />
        <span className="font-display text-xl font-black">VS</span>
        <SideCard side={duel.opp} label={t('rival')} align="right" frozen={oppFrozenLeft > 0} />
      </div>

      {duel.phase === 'countdown' && (
        <div className="m-auto flex flex-col items-center gap-3 text-center">
          <motion.span
            key={Math.ceil(remaining / 1000)}
            initial={{ scale: 2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="font-display text-8xl font-black text-primary"
          >
            {Math.max(1, Math.ceil(remaining / 1000))}
          </motion.span>
          <p className="font-bold">{t('getReady', { total: duel.total })}</p>
        </div>
      )}

      {(duel.phase === 'question' || duel.phase === 'reveal') && q && (
        <div className="relative flex flex-1 flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-surface-2 px-3 py-1 text-sm font-extrabold">
              {duel.qIndex + 1}/{duel.total}
            </span>
            {duel.phase === 'question' &&
              duel.me.freezeLeft > 0 &&
              !duel.opp.answered &&
              !duel.me.answered && (
                <Button size="sm" variant="outline" onClick={freeze}>
                  <Snowflake className="size-4" /> {t('freeze')}
                </Button>
              )}
            {duel.phase === 'question' && (
              <TimerRing
                remainingMs={remaining}
                totalMs={DUEL_QUESTION_SECONDS * 1000}
                size={60}
                className="ml-auto"
              />
            )}
          </div>
          <h1 className="rounded-2xl bg-surface px-4 py-4 text-center font-display text-xl leading-tight font-extrabold md:text-2xl">
            {q.prompt}
          </h1>
          {duel.phase === 'question' ? (
            duel.me.answered ? (
              <p className="m-auto text-lg font-bold">{t('waitingRival')}</p>
            ) : (
              <div className="relative flex-1 text-white">
                <AnswerPad
                  key={duel.qIndex}
                  question={q}
                  showText
                  disabled={frozenLeft > 0}
                  onSubmit={(a) => void answer(a.optionIds)}
                />
                <AnimatePresence>
                  {frozenLeft > 0 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 grid place-items-center rounded-3xl bg-cyan-200/70 text-center text-[#1a1640] backdrop-blur-sm"
                      role="alert"
                    >
                      <span>
                        <span className="block text-6xl" aria-hidden="true">
                          🧊
                        </span>
                        <span className="font-display text-2xl font-black">
                          {t('frozenFor', { seconds: Math.ceil(frozenLeft / 1000) })}
                        </span>
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          ) : (
            duel.round && (
              <div className="flex flex-col gap-3">
                <ul className="grid gap-2 sm:grid-cols-2">
                  {q.options.map((o) => {
                    const right = duel.round!.correctOptionIds.includes(o.id);
                    return (
                      <li
                        key={o.id}
                        className={cn(
                          'rounded-2xl px-4 py-3 font-bold',
                          right ? 'bg-[#12a150] text-white' : 'bg-surface-2 opacity-60',
                        )}
                      >
                        {right && '✅ '}
                        {o.text}
                      </li>
                    );
                  })}
                </ul>
                <div className="grid grid-cols-2 gap-2 text-center">
                  {(['me', 'opp'] as const).map((k) => (
                    <p
                      key={k}
                      className={cn(
                        'rounded-2xl px-3 py-2 font-display text-lg font-black',
                        duel.round![k].correct ? 'bg-[#12a150]/20' : 'bg-danger/15',
                      )}
                    >
                      {k === 'me' ? t('you') : t('rival')}:{' '}
                      {duel.round![k].correct ? `+${duel.round![k].points}` : '✗'}
                    </p>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {duel.phase === 'finished' && duel.result && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto flex w-full max-w-md flex-col items-center gap-4 text-center"
        >
          <p className="text-7xl" aria-hidden="true">
            {{ win: '🏆', lose: '💪', draw: '🤝' }[duel.result.outcome]}
          </p>
          <h1 className="font-display text-4xl font-black">
            {t(`outcome.${duel.result.outcome}`)}
          </h1>
          <p className="font-display text-2xl font-black tabular-nums">
            {duel.me.score.toLocaleString()} – {duel.opp.score.toLocaleString()}
          </p>
          <div className="w-full rounded-3xl bg-[#1a1640] p-4 text-white">
            {duel.result.progress ? (
              <RewardsSummary outcome={duel.result.progress} />
            ) : (
              <p className="text-sm font-bold opacity-80">{t('savingRewards')}</p>
            )}
          </div>
          <Button size="lg" className="w-full" onClick={onAgain}>
            <Swords className="size-5" /> {t('again')}
          </Button>
          <Link href="/solo" className="text-sm font-bold underline">
            {t('backToHub')}
          </Link>
        </motion.section>
      )}
    </div>
  );
}
