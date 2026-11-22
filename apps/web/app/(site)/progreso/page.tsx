// Progreso del jugador: nivel, misiones, liga semanal, pase de temporada y logros.
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { db } from '@quiz-rush/db';
import { ProgressView } from '@/components/progress/progress-view';
import { getProgress } from '@/lib/progress-service';
import { requirePageUser } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('progress');
  return { title: t('title') };
}

export default async function ProgressPage() {
  const user = await requirePageUser('/progreso');
  const [data, avatar] = await Promise.all([
    getProgress(user.id),
    db.avatar.findUnique({ where: { userId: user.id }, select: { config: true } }),
  ]);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <ProgressView initial={data} avatar={avatar?.config ?? null} />
    </div>
  );
}
