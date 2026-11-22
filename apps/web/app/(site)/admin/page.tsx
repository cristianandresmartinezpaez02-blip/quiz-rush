// Panel de administración. Para quien no es admin, la página no existe (404).
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { db } from '@quiz-rush/db';
import { AdminView } from '@/components/admin/admin-view';
import { adminStats } from '@/lib/admin-service';
import { requirePageUser } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin');
  return { title: t('title'), robots: { index: false } };
}

export default async function AdminPage() {
  const user = await requirePageUser('/admin');
  // El rol se confirma en la base de datos (la sesión en caché podría tener uno antiguo)
  const row = await db.user.findUnique({ where: { id: user.id }, select: { role: true } });
  if (row?.role !== 'admin') notFound();
  const [t, stats] = await Promise.all([getTranslations('admin'), adminStats()]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-4xl font-extrabold">🛠️ {t('title')}</h1>
      <p className="mt-1 mb-6 text-muted">{t('subtitle')}</p>
      <AdminView initialStats={stats} me={user.id} />
    </div>
  );
}
