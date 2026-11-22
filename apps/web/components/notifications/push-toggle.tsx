'use client';
// Interruptor de notificaciones push para este dispositivo, con explicación de cada estado.
import { BellOff, BellRing } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { usePush } from '@/lib/use-push';

export function PushToggle() {
  const t = useTranslations('notifications.push');
  const { state, busy, enable, disable } = usePush();

  return (
    <div className="card flex flex-wrap items-center gap-4 p-4">
      <span
        className="grid size-12 place-items-center rounded-2xl bg-accent/15 text-accent"
        aria-hidden="true"
      >
        {state === 'on' ? <BellRing className="size-6" /> : <BellOff className="size-6" />}
      </span>
      <div className="min-w-[12rem] flex-1">
        <p className="font-extrabold">{t('title')}</p>
        <p className="text-sm text-muted" aria-live="polite">
          {state === 'loading' ? '…' : t(`state.${state}`)}
        </p>
      </div>
      {state === 'off' && (
        <Button
          type="button"
          loading={busy}
          onClick={async () => {
            if (await enable()) toast.success(t('enabled'));
          }}
        >
          {t('enable')}
        </Button>
      )}
      {state === 'on' && (
        <Button type="button" variant="outline" loading={busy} onClick={() => void disable()}>
          {t('disable')}
        </Button>
      )}
    </div>
  );
}
