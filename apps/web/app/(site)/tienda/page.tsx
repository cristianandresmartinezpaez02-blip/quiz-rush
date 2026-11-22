// Tienda y editor de avatar: todo se compra con monedas ganadas jugando.
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ShopView } from '@/components/progress/shop-view';
import { getShop } from '@/lib/progress-service';
import { requirePageUser } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shop');
  return { title: t('title') };
}

export default async function ShopPage() {
  const user = await requirePageUser('/tienda');
  const t = await getTranslations('shop');
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-4xl font-extrabold">🛍️ {t('title')}</h1>
      <p className="mt-1 mb-6 text-muted">{t('subtitle')}</p>
      <ShopView initial={await getShop(user.id)} />
    </div>
  );
}
