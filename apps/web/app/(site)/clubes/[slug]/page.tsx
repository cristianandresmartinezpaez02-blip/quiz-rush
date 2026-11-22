// Página de un club: ranking de miembros, quizzes del club y gestión (según el rol).
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ClubView } from '@/components/social/club-view';
import { ApiError } from '@/lib/api';
import { getClub } from '@/lib/club-service';
import { getCurrentUser } from '@/lib/session';

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  const user = await getCurrentUser();
  const club = await getClub({ slug }, user?.id ?? null).catch((err) => {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  });
  return { user, club };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { club } = await load((await params).slug);
  if (!club) return { title: '404' };
  return {
    title: club.name,
    description: club.description ?? undefined,
    robots: club.isPublic ? undefined : { index: false },
  };
}

export default async function ClubPage({ params }: Props) {
  const { user, club } = await load((await params).slug);
  if (!club) notFound();
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <ClubView initial={club} me={user && !user.isAnonymous ? user.id : null} signedIn={!!user} />
    </div>
  );
}
