'use client';
// Activar o desactivar las notificaciones push en ESTE navegador.
import { useCallback, useEffect, useState } from 'react';

export type PushState =
  | 'loading'
  | 'unsupported' // el navegador no tiene Push API (p. ej. Safari de iOS sin instalar la app)
  | 'server-off' // el servidor no tiene claves VAPID
  | 'denied' // la persona bloqueó las notificaciones en el navegador
  | 'off'
  | 'on';

function keyToBytes(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function usePush() {
  const [state, setState] = useState<PushState>('loading');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    ) {
      setState('unsupported');
      return;
    }
    const server = (await fetch('/api/push')
      .then((r) => r.json())
      .catch(() => null)) as {
      enabled: boolean;
    } | null;
    if (!server?.enabled) return setState('server-off');
    if (Notification.permission === 'denied') return setState('denied');
    const reg = await navigator.serviceWorker.ready;
    setState((await reg.pushManager.getSubscription()) ? 'on' : 'off');
  }, []);

  useEffect(() => {
    // La comprobación es asíncrona: el estado se fija cuando termina, no durante el efecto
    const id = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(id);
  }, [refresh]);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return false;
      }
      const { publicKey } = (await fetch('/api/push').then((r) => r.json())) as {
        publicKey: string;
      };
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyToBytes(publicKey),
        }));
      const res = await fetch('/api/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error('subscribe');
      setState('on');
      return true;
    } catch {
      await refresh();
      return false;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe();
      }
      setState('off');
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, enable, disable };
}
