// Duelo 1 contra 1 en tiempo real (rival al azar, amigo con código o RushBot).
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { db } from '@quiz-rush/db';
import { DuelGame } from '@/components/solo/duel-game';
import { requirePageUser } from '@/lib/session';

type Props = { searchParams: Promise<{ code?: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('duel');
  return { title: t('title') };
}

export default async function DuelPage({ searchParams }: Props) {
  const { code } = await searchParams;
  const user = await requirePageUser(code ? `/duelo?code=${code}` : '/duelo');
  const [avatar, equipped] = await Promise.all([
    db.avatar.findUnique({ where: { userId: user.id }, select: { config: true } }),
    db.inventory.findFirst({
      where: { userId: user.id, equipped: true, item: { type: 'CELEBRATION' } },
      select: { item: { select: { code: true } } },
    }),
  ]);
  return (
    <DuelGame
      initialCode={/^\d{4}$/.test(code ?? '') ? code! : null}
      me={{ nick: user.profile?.displayName ?? user.name, avatar: avatar?.config ?? null }}
      celebration={equipped?.item.code ?? null}
    />
  );
}
