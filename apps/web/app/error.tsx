'use client';
// Pantalla de error inesperado con opción de reintentar.
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');
  const tc = useTranslations('common');
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="contenido" className="bg-rush grid min-h-dvh place-items-center px-4">
      <EmptyState
        emoji="⚡"
        title={t('errorTitle')}
        text={t('errorText')}
        className="max-w-lg"
        action={
          <div className="flex gap-3">
            <Button onClick={reset}>{tc('retry')}</Button>
            <Button asChild variant="outline">
              <Link href="/">{t('goHome')}</Link>
            </Button>
          </div>
        }
      />
    </main>
  );
}
