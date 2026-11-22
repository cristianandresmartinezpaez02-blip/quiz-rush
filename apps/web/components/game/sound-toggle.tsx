'use client';
// Botón para silenciar sonidos y música (se recuerda en el dispositivo).
import { Volume2, VolumeX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { isMuted, setMuted, subscribeMuted } from '@/lib/game/sounds';
import { cn } from '@/lib/utils';

export function SoundToggle({ className }: { className?: string }) {
  const t = useTranslations('game');
  // En el servidor no hay localStorage: se asume "con sonido" y el cliente corrige al hidratar
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);
  return (
    <button
      type="button"
      onClick={() => {
        setMuted(!muted);
      }}
      aria-pressed={muted}
      aria-label={muted ? t('unmute') : t('mute')}
      title={muted ? t('unmute') : t('mute')}
      className={cn(
        'grid size-11 cursor-pointer place-items-center rounded-xl bg-black/30 text-white hover:bg-black/45',
        className,
      )}
    >
      {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
    </button>
  );
}
