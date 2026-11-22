'use client';
// Estado de la pantalla del anfitrión / proyector, sincronizado con el servidor de tiempo real.
// Si se corta la conexión, al reconectar vuelve a unirse y recibe el estado completo.
import { useEffect, useReducer, useRef, useState } from 'react';
import type { HostSnapshot, PlayerSummary, ServerToClientEvents, Stroke } from '@quiz-rush/shared';
import {
  clockOffset,
  createGameSocket,
  emitAck,
  fetchRealtimeToken,
  type GameClient,
} from '@/lib/game/socket';

type PhaseEvent = Parameters<ServerToClientEvents['phase']>[0];

interface State {
  status: 'connecting' | 'ready' | 'reconnecting' | 'error';
  error: string | null;
  snap: HostSnapshot | null;
  offset: number;
  /** Nube de palabras en vivo de la pregunta actual */
  cloud: [string, number][];
  /** Dibujo en vivo de la pregunta actual */
  strokes: Stroke[];
}

type Action =
  | { type: 'snapshot'; snap: HostSnapshot }
  | { type: 'phase'; e: PhaseEvent }
  | {
      type: 'players';
      joined?: PlayerSummary & { team: number | null };
      left?: string;
      count: number;
    }
  | { type: 'teams'; teams: Record<string, number> }
  | { type: 'cloud'; qIndex: number; words: [string, number][] }
  | { type: 'stroke'; qIndex: number; stroke: Stroke }
  | { type: 'clear'; qIndex: number }
  | { type: 'answered'; qIndex: number; answered: number; players: number }
  | { type: 'locked'; locked: boolean }
  | { type: 'settings'; settings: HostSnapshot['settings'] }
  | { type: 'ended' }
  | { type: 'status'; status: State['status']; error?: string | null };

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case 'snapshot':
      return {
        status: 'ready',
        error: null,
        snap: a.snap,
        offset: clockOffset(a.snap.serverNow),
        cloud: state.snap?.qIndex === a.snap.qIndex ? state.cloud : [],
        strokes: a.snap.strokes ?? [],
      };
    case 'status':
      return { ...state, status: a.status, error: a.error ?? null };
    case 'phase': {
      if (!state.snap) return state;
      const e = a.e;
      const newQuestion =
        e.phase === 'getReady' || (e.phase === 'question' && e.qIndex !== state.snap.qIndex);
      return {
        ...state,
        cloud: newQuestion ? [] : state.cloud,
        strokes: newQuestion ? [] : state.strokes,
        offset: clockOffset(e.serverNow),
        snap: {
          ...state.snap,
          phase: e.phase,
          qIndex: e.qIndex,
          question: e.question !== undefined ? e.question : state.snap.question,
          endsAt: e.endsAt ?? null,
          reveal: e.reveal ?? (e.phase === 'reveal' ? state.snap.reveal : null),
          leaderboard: e.leaderboard ?? null,
          podium: e.podium ?? state.snap.podium,
          modeState: e.modeState !== undefined ? e.modeState : state.snap.modeState,
          candidates: e.candidates ?? (e.phase === 'vote' ? state.snap.candidates : null),
          answered:
            e.phase === 'question' && e.qIndex !== state.snap.qIndex
              ? 0
              : e.phase === 'getReady'
                ? 0
                : state.snap.answered,
        },
      };
    }
    case 'players': {
      if (!state.snap) return state;
      let players = state.snap.players;
      if (a.joined && !players.some((p) => p.id === a.joined!.id)) players = [...players, a.joined];
      if (a.left) players = players.filter((p) => p.id !== a.left);
      return { ...state, snap: { ...state.snap, players, playerCount: a.count } };
    }
    case 'answered':
      if (!state.snap || a.qIndex !== state.snap.qIndex) return state;
      // `players` es quién puede responder (sin eliminados ni quien dibuja): no es el total de la sala
      return { ...state, snap: { ...state.snap, answered: a.answered } };
    case 'teams':
      if (!state.snap) return state;
      return {
        ...state,
        snap: {
          ...state.snap,
          players: state.snap.players.map((p) => ({ ...p, team: a.teams[p.id] ?? p.team })),
        },
      };
    case 'cloud':
      if (!state.snap || a.qIndex !== state.snap.qIndex) return state;
      return { ...state, cloud: a.words };
    case 'stroke':
      if (!state.snap || a.qIndex !== state.snap.qIndex) return state;
      return { ...state, strokes: [...state.strokes, a.stroke] };
    case 'clear':
      if (!state.snap || a.qIndex !== state.snap.qIndex) return state;
      return { ...state, strokes: [] };
    case 'settings':
      return state.snap ? { ...state, snap: { ...state.snap, settings: a.settings } } : state;
    case 'locked':
      return state.snap ? { ...state, snap: { ...state.snap, locked: a.locked } } : state;
    case 'ended':
      return state.snap ? { ...state, snap: { ...state.snap, phase: 'ended' } } : state;
  }
}

export type ScreenMode =
  { kind: 'host'; gameId: string } | { kind: 'spectator'; gameId: string; key: string };

export function useScreenGame(mode: ScreenMode) {
  const [state, dispatch] = useReducer(reducer, {
    status: 'connecting',
    error: null,
    snap: null,
    offset: 0,
    cloud: [],
    strokes: [],
  });
  const [socket, setSocket] = useState<GameClient | null>(null);
  const modeRef = useRef(mode);

  useEffect(() => {
    const s = createGameSocket();

    const join = async () => {
      try {
        const m = modeRef.current;
        const snap =
          m.kind === 'host'
            ? await emitAck<HostSnapshot>(s, 'host:join', {
                gameId: m.gameId,
                authToken: (await fetchRealtimeToken()) ?? '',
              })
            : await emitAck<HostSnapshot>(s, 'spectator:join', { gameId: m.gameId, key: m.key });
        dispatch({ type: 'snapshot', snap });
      } catch (err) {
        dispatch({ type: 'status', status: 'error', error: (err as Error).message });
      }
    };

    s.on('connect', () => void join());
    s.on('disconnect', () => dispatch({ type: 'status', status: 'reconnecting' }));
    s.on('phase', (e) => dispatch({ type: 'phase', e }));
    s.on('lobby:player', (d) => dispatch({ type: 'players', ...d }));
    s.on('answers:count', (d) => dispatch({ type: 'answered', ...d }));
    s.on('lobby:teams', (teams) => dispatch({ type: 'teams', teams }));
    s.on('cloud:update', (d) => dispatch({ type: 'cloud', ...d }));
    s.on('draw:stroke', (d) => dispatch({ type: 'stroke', ...d }));
    s.on('draw:clear', (d) => dispatch({ type: 'clear', ...d }));
    s.on('room:settings', (settings) => dispatch({ type: 'settings', settings }));
    s.on('room:locked', ({ locked }) => dispatch({ type: 'locked', locked }));
    s.on('game:ended', () => dispatch({ type: 'ended' }));
    setSocket(s);

    return () => {
      s.removeAllListeners();
      s.disconnect();
    };
  }, []);

  /** Envía un comando del anfitrión y devuelve el error (si lo hay). */
  const command = async (event: string, data?: unknown): Promise<string | null> => {
    if (!socket) return 'NOT_CONNECTED';
    try {
      if (data === undefined) await emitAck(socket, event);
      else await emitAck(socket, event, data);
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  };

  return { ...state, socket, command };
}
