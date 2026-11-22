// Unirse a una partida desde el celular (PIN o QR).
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PlayerGame } from '@/components/game/player-game';
import { getCurrentUser } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('game');
  return { title: t('playTitle') };
}

export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<{ pin?: string }>;
}) {
  const { pin } = await searchParams;
  const user = await getCurrentUser();
  // Con cuenta: se propone su nombre como apodo y la partida se suma a sus estadísticas
  const defaultNick =
    user && !user.isAnonymous ? (user.profile?.displayName ?? user.name) : undefined;
  return (
    <PlayerGame
      initialPin={/^\d{6}$/.test(pin ?? '') ? pin : undefined}
      defaultNick={defaultNick}
      signedIn={!!user}
    />
  );
}
