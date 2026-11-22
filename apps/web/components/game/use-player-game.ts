'use client';
// Estado del jugador en el celular. La sesión de juego se guarda en el dispositivo:
// si se recarga la página o se corta la conexión, vuelve a la partida sin perder puntos.
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type {
  AnswerPayload,
  PlayerResult,
  PlayerSnapshot,
  PlayerSummary,
  PowerUp,
  PowerUpResult,
  ResultMessageKey,
  ServerToClientEvents,
  Stroke,
} from '@quiz-rush/shared';
import {
  clockOffset,
  createGameSocket,
  emitAck,
  fetchRealtimeToken,
  type GameClient,
} from '@/lib/game/socket';

const SESSION_KEY = 'quizrush:play-session';

interface PlaySession {
  gameId: string;
  reconnectToken: string;
  pin: string;
}

type PhaseEvent = Parameters<ServerToClientEvents['phase']>[0];
type MetaEvent = Parameters<ServerToClientEvents['player:meta']>[0];

export interface FinalResult {
  rank: number;
  score: number;
  players: number;
  messageKey: ResultMessageKey;
  team?: { index: number; rank: number };
}

/** Efectos de power-ups activos en la pregunta actual. */
export interface ActiveEffects {
  qIndex: number;
  /** 50/50: opciones ocultas */
  hide: string[];
  hint: string | null;
  /** +10 s: nuevo final para este jugador */
  endsAt: number | null;
  active: PowerUp[];
}

export interface PlayerState {
  step: 'pin' | 'profile' | 'resuming' | 'playing' | 'kicked' | 'ended';
  pin: string;
  gameInfo: { quizTitle: string; theme: string; started: boolean } | null;
  snap: PlayerSnapshot | null;
  offset: number;
  result: PlayerResult | null;
  final: FinalResult | null;
  answeredQ: number | null;
  /** Votación: pregunta en la que ya votó */
  votedQ: number | null;
  /** Texto propio enviado en la pregunta abierta (para no poder votarse a sí mismo) */
  ownText: string | null;
  online: boolean;
  /** Torneo: rival de la ronda actual */
  opponent: PlayerSummary | null;
  effects: ActiveEffects | null;
  /** Dibujo: trazos recibidos de quien dibuja */
  strokes: Stroke[];
}

type Action =
  | { type: 'pinOk'; pin: string; info: PlayerState['gameInfo'] }
  | { type: 'step'; step: PlayerState['step'] }
  | { type: 'snapshot'; snap: PlayerSnapshot }
  | { type: 'phase'; e: PhaseEvent }
  | { type: 'result'; r: PlayerResult }
  | { type: 'final'; f: FinalResult }
  | { type: 'answered'; qIndex: number | null; text?: string | null }
  | { type: 'voted'; qIndex: number | null }
  | { type: 'online'; online: boolean }
  | { type: 'meta'; m: MetaEvent }
  | { type: 'team'; team: number }
  | { type: 'settings'; settings: PlayerSnapshot['settings'] }
  | { type: 'powerup'; qIndex: number; r: PowerUpResult }
  | { type: 'stroke'; qIndex: number; stroke: Stroke }
  | { type: 'clear'; qIndex: number }
  | { type: 'reset' };

const initial: PlayerState = {
  step: 'resuming',
  pin: '',
  gameInfo: null,
  snap: null,
  offset: 0,
  result: null,
  final: null,
  answeredQ: null,
  votedQ: null,
  ownText: null,
  online: true,
  opponent: null,
  effects: null,
  strokes: [],
};

function reducer(s: PlayerState, a: Action): PlayerState {
  switch (a.type) {
    case 'pinOk':
      return { ...s, step: 'profile', pin: a.pin, gameInfo: a.info };
    case 'step':
      return { ...s, step: a.step };
    case 'reset':
      return { ...initial, step: 'pin' };
    case 'online':
      return { ...s, online: a.online };
    case 'snapshot':
      return {
        ...s,
        step: 'playing',
        snap: a.snap,
        offset: clockOffset(a.snap.serverNow),
        result: a.snap.lastResult ?? s.result,
        answeredQ: a.snap.answeredCurrent ? a.snap.qIndex : s.answeredQ,
        strokes: a.snap.strokes ?? [],
        online: true,
      };
    case 'phase': {
      if (!s.snap) return s;
      const e = a.e;
      const newQuestion =
        e.phase === 'getReady' || (e.phase === 'question' && e.qIndex !== s.snap.qIndex);
      return {
        ...s,
        offset: clockOffset(e.serverNow),
        result: newQuestion ? null : s.result,
        effects: newQuestion ? null : s.effects,
        strokes: newQuestion ? [] : s.strokes,
        ownText: newQuestion ? null : s.ownText,
        snap: {
          ...s.snap,
          phase: e.phase,
          qIndex: e.qIndex,
          question: e.question !== undefined ? e.question : s.snap.question,
          endsAt: e.endsAt ?? null,
          reveal: e.reveal ?? null,
          leaderboard: e.leaderboard ?? null,
          podium: e.podium ?? s.snap.podium,
          modeState: e.modeState !== undefined ? e.modeState : s.snap.modeState,
          candidates: e.candidates ?? (e.phase === 'vote' ? s.snap.candidates : null),
          // La palabra secreta solo vale para la pregunta en que se recibió
          drawWord: newQuestion && e.phase === 'question' ? null : s.snap.drawWord,
        },
      };
    }
    case 'result': {
      if (!s.snap) return { ...s, result: a.r };
      const me = { ...s.snap.me, score: a.r.total, rank: a.r.rank };
      if (a.r.lives !== undefined) me.lives = a.r.lives;
      if (a.r.eliminated !== undefined) me.eliminated = a.r.eliminated;
      if (a.r.duel?.out) me.eliminated = true;
      return { ...s, result: a.r, snap: { ...s.snap, me } };
    }
    case 'final':
      return { ...s, final: a.f };
    case 'answered':
      return {
        ...s,
        answeredQ: a.qIndex,
        ownText: a.text !== undefined ? a.text : s.ownText,
      };
    case 'voted':
      return { ...s, votedQ: a.qIndex };
    case 'meta': {
      if (!s.snap) return s;
      const me = { ...s.snap.me };
      if (a.m.powerUps) me.powerUps = a.m.powerUps;
      if (a.m.lives !== undefined) me.lives = a.m.lives;
      if (a.m.team !== undefined) me.team = a.m.team;
      if (a.m.eliminated !== undefined) me.eliminated = a.m.eliminated;
      return {
        ...s,
        opponent: a.m.opponent !== undefined ? a.m.opponent : s.opponent,
        snap: {
          ...s.snap,
          me,
          drawWord: a.m.drawWord !== undefined ? a.m.drawWord : s.snap.drawWord,
        },
      };
    }
    case 'settings':
      return s.snap ? { ...s, snap: { ...s.snap, settings: a.settings } } : s;
    case 'team':
      return s.snap ? { ...s, snap: { ...s.snap, me: { ...s.snap.me, team: a.team } } } : s;
    case 'powerup': {
      if (!s.snap) return s;
      const fx: ActiveEffects =
        s.effects?.qIndex === a.qIndex
          ? { ...s.effects }
          : { qIndex: a.qIndex, hide: [], hint: null, endsAt: null, active: [] };
      fx.active = [...fx.active, a.r.type];
      if (a.r.type === 'fifty') fx.hide = a.r.hide;
      if (a.r.type === 'hint') fx.hint = a.r.hint;
      if (a.r.type === 'time') fx.endsAt = a.r.endsAt;
      const powerUps = s.snap.me.powerUps.filter((p) => p !== a.r.type);
      return { ...s, effects: fx, snap: { ...s.snap, me: { ...s.snap.me, powerUps } } };
    }
    case 'stroke':
      if (!s.snap || a.qIndex !== s.snap.qIndex) return s;
      return { ...s, strokes: [...s.strokes, a.stroke] };
    case 'clear':
      if (!s.snap || a.qIndex !== s.snap.qIndex) return s;
      return { ...s, strokes: [] };
  }
}

function readSession(): PlaySession | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as PlaySession | null;
  } catch {
    return null;
  }
}
const clearSession = () => localStorage.removeItem(SESSION_KEY);

/** Resultado de enviar una respuesta. */
export type AnswerOutcome =
  | { ok: true }
  | { ok: false; error: string }
  /** Segunda oportunidad: falló pero puede intentarlo otra vez */
  | { ok: false; retry: true }
  /** Dibujo: no era la palabra, puede seguir adivinando */
  | { ok: false; wrong: true };

export function usePlayerGame(initialPin?: string, signedIn = false) {
  const [state, dispatch] = useReducer(reducer, initial);
  const [socket, setSocket] = useState<GameClient | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    const s = createGameSocket();

    // Al conectar (o reconectar): si hay sesión guardada, volver a la partida
    s.on('connect', async () => {
      dispatch({ type: 'online', online: true });
      const session = readSession();
      if (
        !session ||
        (initialPin && session.pin !== initialPin && stateRef.current.step !== 'playing')
      ) {
        if (stateRef.current.step === 'resuming') dispatch({ type: 'reset' });
        return;
      }
      try {
        const snap = await emitAck<PlayerSnapshot>(s, 'player:resume', session);
        dispatch({ type: 'snapshot', snap });
      } catch {
        // La partida ya no existe (terminó o caducó): si estaba jugando, se le informa
        clearSession();
        if (stateRef.current.step === 'playing') dispatch({ type: 'step', step: 'ended' });
        else dispatch({ type: 'reset' });
      }
    });
    s.on('disconnect', () => dispatch({ type: 'online', online: false }));
    s.on('phase', (e) => dispatch({ type: 'phase', e }));
    s.on('player:result', (r) => dispatch({ type: 'result', r }));
    s.on('player:final', (f) => dispatch({ type: 'final', f }));
    s.on('player:meta', (m) => dispatch({ type: 'meta', m }));
    s.on('room:settings', (settings) => dispatch({ type: 'settings', settings }));
    s.on('lobby:teams', (teams) => {
      const me = stateRef.current.snap?.me.id;
      if (me && teams[me] !== undefined) dispatch({ type: 'team', team: teams[me]! });
    });
    s.on('draw:stroke', ({ qIndex, stroke }) => dispatch({ type: 'stroke', qIndex, stroke }));
    s.on('draw:clear', ({ qIndex }) => dispatch({ type: 'clear', qIndex }));
    s.on('player:kicked', () => {
      clearSession();
      dispatch({ type: 'step', step: 'kicked' });
    });
    s.on('game:ended', () => {
      clearSession();
      dispatch({ type: 'step', step: 'ended' });
    });
    setSocket(s);
    return () => {
      s.removeAllListeners();
      s.disconnect();
    };
  }, [initialPin]);

  const checkPin = useCallback(
    async (pin: string) => {
      if (!socket) throw new Error('NOT_CONNECTED');
      const info = await emitAck<{ quizTitle: string; theme: string; started: boolean }>(
        socket,
        'player:check',
        { pin },
      );
      dispatch({ type: 'pinOk', pin, info });
    },
    [socket],
  );

  const join = useCallback(
    async (nickname: string, avatar: string) => {
      if (!socket) throw new Error('NOT_CONNECTED');
      const pin = stateRef.current.pin;
      // Solo quien tiene sesión pide su token (los invitados sin cuenta juegan sin él)
      const authToken = signedIn ? ((await fetchRealtimeToken()) ?? undefined) : undefined;
      const res = await emitAck<{
        playerId: string;
        reconnectToken: string;
        gameId: string;
        snapshot: PlayerSnapshot;
      }>(socket, 'player:join', { pin, nickname, avatar, authToken });
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ gameId: res.gameId, reconnectToken: res.reconnectToken, pin }),
      );
      dispatch({ type: 'snapshot', snap: res.snapshot });
    },
    [socket, signedIn],
  );

  const answer = useCallback(
    async (payload: Omit<AnswerPayload, 'qIndex'>): Promise<AnswerOutcome> => {
      const s = stateRef.current;
      if (!socket || !s.snap) return { ok: false, error: 'NOT_CONNECTED' };
      const qIndex = s.snap.qIndex;
      const isDraw = s.snap.question?.type === 'DRAW';
      // Optimista: la pantalla pasa a "respuesta enviada" (en el dibujo se espera la confirmación)
      if (!isDraw) dispatch({ type: 'answered', qIndex, text: payload.text ?? null });
      try {
        const res = await emitAck<{ received: boolean; retry?: boolean; correct?: boolean }>(
          socket,
          'player:answer',
          { qIndex, ...payload },
        );
        if (res.retry) {
          dispatch({ type: 'answered', qIndex: null });
          return { ok: false, retry: true };
        }
        if (!res.received) return { ok: false, wrong: true };
        if (isDraw) dispatch({ type: 'answered', qIndex });
        return { ok: true };
      } catch (err) {
        const code = (err as Error).message;
        // Si ya estaba cerrada o duplicada, no se puede volver a intentar
        if (!['CLOSED', 'DUPLICATE', 'TIME_UP'].includes(code))
          dispatch({ type: 'answered', qIndex: null, text: null });
        return { ok: false, error: code };
      }
    },
    [socket],
  );

  const vote = useCallback(
    async (candidateId: string): Promise<string | null> => {
      const s = stateRef.current;
      if (!socket || !s.snap) return 'NOT_CONNECTED';
      const qIndex = s.snap.qIndex;
      dispatch({ type: 'voted', qIndex });
      try {
        await emitAck(socket, 'player:vote', { qIndex, candidateId });
        return null;
      } catch (err) {
        const code = (err as Error).message;
        if (code !== 'DUPLICATE' && code !== 'CLOSED') dispatch({ type: 'voted', qIndex: null });
        return code;
      }
    },
    [socket],
  );

  const activatePowerUp = useCallback(
    async (type: PowerUp): Promise<string | null> => {
      const s = stateRef.current;
      if (!socket || !s.snap) return 'NOT_CONNECTED';
      const qIndex = s.snap.qIndex;
      try {
        const r = await emitAck<PowerUpResult>(socket, 'player:powerup', { qIndex, type });
        dispatch({ type: 'powerup', qIndex, r });
        return null;
      } catch (err) {
        return (err as Error).message;
      }
    },
    [socket],
  );

  /** Dibujo: envía un lote de trazo (el servidor lo reenvía a la pantalla y a los demás). */
  const sendStroke = useCallback(
    (stroke: Stroke) => {
      const s = stateRef.current;
      if (socket && s.snap) socket.emit('draw:stroke', { qIndex: s.snap.qIndex, stroke });
    },
    [socket],
  );
  const clearDrawing = useCallback(() => {
    const s = stateRef.current;
    if (socket && s.snap) socket.emit('draw:clear', { qIndex: s.snap.qIndex });
  }, [socket]);

  const leave = useCallback(() => {
    socket?.emit('player:leave');
    clearSession();
    dispatch({ type: 'reset' });
  }, [socket]);

  const back = useCallback(() => dispatch({ type: 'reset' }), []);

  return {
    state,
    socket,
    checkPin,
    join,
    answer,
    vote,
    activatePowerUp,
    sendStroke,
    clearDrawing,
    leave,
    back,
  };
}
