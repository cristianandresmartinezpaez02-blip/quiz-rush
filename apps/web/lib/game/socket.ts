'use client';
// Cliente Socket.IO de las partidas en vivo.
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@quiz-rush/shared';

export type GameClient = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Reconexión con espera progresiva (1 s → 10 s) y "jitter" aleatorio del 50 %:
 * si se cae un servidor con 2.000 jugadores, no se reconectan todos en el mismo instante.
 */
export function createGameSocket(): GameClient {
  return io(process.env.NEXT_PUBLIC_REALTIME_URL ?? 'http://localhost:4000', {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    randomizationFactor: 0.5,
    timeout: 10_000,
    autoConnect: true,
  });
}

/** Emite un evento con confirmación y devuelve los datos (o lanza el código de error). */
export function emitAck<T>(socket: GameClient, event: string, ...args: unknown[]): Promise<T> {
  // Emisión genérica (el nombre del evento llega como texto): se tipa la función a mano
  const emitter = socket.timeout(8000) as unknown as {
    emit: (event: string, ...args: unknown[]) => void;
  };
  return new Promise((resolve, reject) => {
    emitter.emit(
      event,
      ...args,
      (err: Error | null, res?: { ok: boolean; data?: T; error?: string }) => {
        if (err) return reject(new Error('TIMEOUT'));
        if (!res?.ok) return reject(new Error(res?.error ?? 'INTERNAL'));
        resolve(res.data as T);
      },
    );
  });
}

/** Token JWT de la sesión actual (para que el servidor de tiempo real sepa quién eres). */
export async function fetchRealtimeToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/token', { credentials: 'include' });
    if (!res.ok) return null;
    return ((await res.json()) as { token?: string }).token ?? null;
  } catch {
    return null;
  }
}

/** Diferencia entre el reloj del servidor y el del dispositivo (ms). */
export function clockOffset(serverNow: number): number {
  return serverNow - Date.now();
}
