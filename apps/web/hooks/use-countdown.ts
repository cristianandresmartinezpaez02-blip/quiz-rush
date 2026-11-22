'use client';
// Tiempo restante sincronizado con el reloj del servidor (no con el del dispositivo).
import { useEffect, useState } from 'react';

/**
 * @param endsAt  hora del servidor (ms) en que termina la fase
 * @param offset  diferencia reloj servidor − reloj local (ms)
 * @returns milisegundos restantes (se actualiza ~10 veces por segundo)
 */
export function useCountdown(endsAt: number | null, offset: number): number {
  const compute = () => (endsAt ? Math.max(0, endsAt - (Date.now() + offset)) : 0);
  const [remaining, setRemaining] = useState(compute);

  useEffect(() => {
    if (!endsAt) return;
    const tick = () => setRemaining(Math.max(0, endsAt - (Date.now() + offset)));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [endsAt, offset]);

  return endsAt ? remaining : 0;
}
