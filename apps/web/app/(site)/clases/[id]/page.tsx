// Una clase (vista de profe o de estudiante).
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ClassView } from '@/components/classes/class-view';
import { ApiError } from '@/lib/api';
import { getClass } from '@/lib/class-service';
import { requirePageUser } from '@/lib/session';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('classes');
  return { title: t('title'), robots: { index: false } };
}

async function load(userId: string, id: string) {
  const data = await getClass(userId, id).catch((err) => {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  });
  // La hora se fija al cargar: la vista no llama a Date.now() al renderizar
  return data && { data, now: Date.now() };
}

export default async function ClassPage({ params }: Props) {
  const { id } = await params;
  const user = await requirePageUser(`/clases/${id}`);
  const loaded = await load(user.id, id);
  if (!loaded) notFound();
  const { data, now } = loaded;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <ClassView initial={data} me={user.id} now={now} />
    </div>
  );
}
