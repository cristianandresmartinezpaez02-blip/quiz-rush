// Modo Aventura: mapa de mundos con niveles, estrellas y desbloqueos.
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import {
  ADVENTURE_MAX_STARS,
  ADVENTURE_WORLDS,
  isLevelUnlocked,
  levelKey,
} from '@quiz-rush/shared';
import { AdventureMap } from '@/components/solo/adventure-map';
import { requirePageUser } from '@/lib/session';
import { adventureStars } from '@/lib/solo-content';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('solo');
  return { title: t('modes.ADVENTURE.name') };
}

export default async function AdventurePage() {
  const user = await requirePageUser('/aventura');
  const t = await getTranslations('solo');
  const stars = await adventureStars(user.id);
  const worlds = ADVENTURE_WORLDS.map((w) => ({
    id: w.id,
    emoji: w.emoji,
    color: w.color,
    levels: Array.from({ length: w.levels }, (_, i) => {
      const key = levelKey(w.id, i + 1);
      return { key, level: i + 1, stars: stars[key] ?? 0, unlocked: isLevelUnlocked(key, stars) };
    }),
  }));
  const total = Object.values(stars).reduce((a, b) => a + b, 0);
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="text-4xl font-extrabold">🗺️ {t('modes.ADVENTURE.name')}</h1>
          <p className="mt-1 text-muted">{t('adventureHelp')}</p>
        </div>
        <p className="rounded-2xl bg-surface-2 px-4 py-2 font-display text-xl font-black">
          ⭐ {total} / {ADVENTURE_MAX_STARS}
        </p>
      </div>
      <AdventureMap worlds={worlds} />
    </div>
  );
}
