// Modo espectador: la vista de proyector sin controles (para pantallas grandes).
// Se accede con el enlace secreto que genera el anfitrión.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ScreenGame } from '@/components/game/screen-game';

type Props = { params: Promise<{ gameId: string }>; searchParams: Promise<{ k?: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('game');
  return { title: t('screenTitle'), robots: { index: false } };
}

export default async function SpectatorPage({ params, searchParams }: Props) {
  const [{ gameId }, { k }] = await Promise.all([params, searchParams]);
  if (!k) notFound();
  return <ScreenGame mode={{ kind: 'spectator', gameId, key: k }} />;
}
