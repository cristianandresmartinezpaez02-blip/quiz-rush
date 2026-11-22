// Pantalla del anfitrión (controles + vista para proyector). Solo el creador de la partida.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ScreenGame } from '@/components/game/screen-game';
import { getHostedGame } from '@/lib/game-service';
import { requirePageUser } from '@/lib/session';

type Props = { params: Promise<{ gameId: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('game');
  return { title: t('hostTitle'), robots: { index: false } };
}

export default async function HostPage({ params }: Props) {
  const { gameId } = await params;
  const user = await requirePageUser(`/host/${gameId}`);
  const game = await getHostedGame(gameId, user.id);
  if (!game) notFound();
  return <ScreenGame mode={{ kind: 'host', gameId }} quizId={game.quiz?.id} />;
}
