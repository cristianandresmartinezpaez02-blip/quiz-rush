// Punto de presencia sobre el avatar: verde en línea, amarillo jugando, gris desconectado.
// El color nunca va solo: lleva texto accesible y un icono para lo que está haciendo.
import type { PresenceActivity } from '@quiz-rush/shared';
import { cn } from '@/lib/utils';

const ICON: Partial<Record<PresenceActivity, string>> = {
  playing: '🎮',
  hosting: '📺',
  solo: '⚡',
  editing: '✏️',
};

export function PresenceDot({
  activity,
  label,
}: {
  activity: PresenceActivity | null;
  label: string;
}) {
  return (
    <span
      className={cn(
        'absolute -right-0.5 -bottom-0.5 grid size-5 place-items-center rounded-full border-2 border-surface text-[10px]',
        !activity ? 'bg-muted/60' : activity === 'online' ? 'bg-success' : 'bg-[#ffb020]',
      )}
      title={label}
    >
      <span aria-hidden="true">{activity ? ICON[activity] : null}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
