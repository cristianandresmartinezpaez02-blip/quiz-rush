// Partida individual en curso (o su resumen si ya terminó).
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { db } from '@quiz-rush/db';
import { SoloGame } from '@/components/solo/solo-game';
import { ApiError } from '@/lib/api';
import { requirePageUser } from '@/lib/session';
import { getSolo } from '@/lib/solo-service';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('solo');
  return { title: t('hubTitle'), robots: { index: false } };
}

export default async function SoloGamePage({ params }: Props) {
  const { id } = await params;
  const user = await requirePageUser(`/solo/${id}`);
  const data = await getSolo(user.id, id).catch((err) => {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  });
  if (!data) notFound();
  const equipped = await db.inventory.findFirst({
    where: { userId: user.id, equipped: true, item: { type: 'CELEBRATION' } },
    select: { item: { select: { code: true } } },
  });
  return (
    <SoloGame
      initial={data.view}
      initialSummary={data.summary}
      celebration={equipped?.item.code ?? null}
    />
  );
}
