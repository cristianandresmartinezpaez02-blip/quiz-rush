'use client';
// Servicios de fondo de la app (sin interfaz):
//  • Registra el service worker (app instalable, página sin conexión y notificaciones push).
//  • Latido de presencia cada 45 s mientras la pestaña está visible, con lo que se está haciendo
//    (deducido de la página): así los amigos ven el punto verde.
//  • Aplica la preferencia de sonido del perfil.
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { PRESENCE, type PresenceActivity } from '@quiz-rush/shared';

function activityFor(path: string): PresenceActivity {
  if (path.startsWith('/host') || path.startsWith('/pantalla')) return 'hosting';
  if (path.startsWith('/jugar')) return 'playing';
  if (/^\/(solo|duelo|aventura|reto-diario|desafio)/.test(path)) return 'solo';
  if (path.startsWith('/crear')) return 'editing';
  return 'online';
}

export function AppServices({
  signedIn,
  soundEnabled,
}: {
  signedIn: boolean;
  soundEnabled: boolean;
}) {
  const pathname = usePathname();
  const activity = activityFor(pathname);

  // Service worker: en desarrollo no guarda archivos en caché (rompería la recarga en caliente)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const url = process.env.NODE_ENV === 'production' ? '/sw.js' : '/sw.js?dev=1';
    navigator.serviceWorker.register(url, { scope: '/' }).catch(() => {});
  }, []);

  useEffect(() => {
    if (soundEnabled) return;
    void import('@/lib/game/sounds').then((s) => s.setMuted(true));
  }, [soundEnabled]);

  useEffect(() => {
    if (!signedIn) return;
    const beat = () => {
      if (document.visibilityState !== 'visible') return;
      // Cada recarga de página monta esto de nuevo: no repetir el latido si es reciente
      const last = sessionStorage.getItem('quizrush:beat');
      const [prevActivity, prevAt] = last ? last.split('|') : [];
      if (prevActivity === activity && Date.now() - Number(prevAt) < 20_000) return;
      sessionStorage.setItem('quizrush:beat', `${activity}|${Date.now()}`);
      void fetch('/api/presence', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ activity }),
        keepalive: true,
      }).catch(() => {});
    };
    beat();
    const id = setInterval(beat, PRESENCE.heartbeatMs);
    document.addEventListener('visibilitychange', beat);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', beat);
    };
  }, [signedIn, activity]);

  return null;
}
