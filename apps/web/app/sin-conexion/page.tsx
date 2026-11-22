// Página que muestra el service worker cuando no hay conexión. No carga datos: se guarda en
// caché al instalar la app y debe funcionar sola.
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { RetryButton } from './retry-button';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('offline');
  return { title: t('title'), robots: { index: false } };
}

export default async function OfflinePage() {
  const t = await getTranslations('offline');
  return (
    <main id="contenido" className="bg-rush grid min-h-dvh place-items-center px-6 text-center">
      <div className="flex max-w-md flex-col items-center gap-4">
        <p className="text-7xl" aria-hidden="true">
          📡
        </p>
        <h1 className="text-3xl font-extrabold">{t('title')}</h1>
        <p className="text-muted">{t('text')}</p>
        <RetryButton label={t('retry')} />
        <p className="text-sm text-muted">{t('tip')}</p>
      </div>
    </main>
  );
}
