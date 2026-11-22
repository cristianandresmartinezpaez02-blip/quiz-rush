'use client';
// Botón que empieza una partida individual y lleva a ella.
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button, type ButtonProps } from '@/components/ui/button';
import { startSoloGame } from '@/lib/client-api';

export function StartSoloButton({
  input,
  children,
  ...props
}: { input: Record<string, unknown>; children: ReactNode } & Omit<ButtonProps, 'onClick'>) {
  const te = useTranslations('errors');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      {...props}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          router.push(`/solo/${await startSoloGame(input)}`);
        } catch (err) {
          const code = (err as Error).message;
          toast.error(te.has(code) ? te(code as 'INTERNAL') : te('INTERNAL'));
          setBusy(false);
        }
      }}
    >
      {children}
    </Button>
  );
}
