// Mis clases: crear una (profe) o unirse con un código (estudiante).
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ClassesView } from '@/components/classes/classes-view';
import { listMyClasses } from '@/lib/class-service';
import { requirePageUser } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('classes');
  return { title: t('title') };
}

export default async function ClassesPage() {
  const user = await requirePageUser('/clases');
  const t = await getTranslations('classes');
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-4xl font-extrabold">🏫 {t('title')}</h1>
      <p className="mt-1 mb-6 text-muted">{t('subtitle')}</p>
      <ClassesView initial={await listMyClasses(user.id)} isGuest={user.isAnonymous} />
    </div>
  );
}
