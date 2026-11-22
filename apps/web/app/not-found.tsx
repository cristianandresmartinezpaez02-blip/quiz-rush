import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export default async function NotFound() {
  const t = await getTranslations('errors');
  return (
    <main id="contenido" className="bg-rush grid min-h-dvh place-items-center px-4">
      <EmptyState
        emoji="🛸"
        title={t('notFoundTitle')}
        text={t('notFoundText')}
        className="max-w-lg"
        action={
          <Button asChild size="lg">
            <Link href="/">{t('goHome')}</Link>
          </Button>
        }
      />
    </main>
  );
}
