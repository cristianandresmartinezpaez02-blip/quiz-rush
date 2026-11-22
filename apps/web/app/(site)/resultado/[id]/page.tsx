// Resultado compartido: la tarjeta (la misma imagen que ven las redes) y una invitación a jugar.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { buttonClass } from '@/components/ui/button-styles';
import { getShareResult } from '@/lib/share-service';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const [r, t] = await Promise.all([getShareResult(id), getTranslations('share')]);
  if (!r) return { title: '404' };
  const title = t('metaTitle', { name: r.nickname, score: r.score });
  const description = r.quizTitle ? t('metaDescription', { quiz: r.quizTitle }) : t('beatIt');
  // robots: no indexar resultados personales
  const image = { url: `/resultado/${id}/imagen`, width: 1200, height: 630, alt: title };
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  };
}

export default async function SharedResultPage({ params }: Props) {
  const { id } = await params;
  const [r, t] = await Promise.all([getShareResult(id), getTranslations('share')]);
  if (!r) notFound();
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-10 text-center">
      <h1 className="text-3xl font-extrabold">{t('scored', { name: r.nickname })}</h1>
      {/* eslint-disable-next-line @next/next/no-img-element -- imagen generada en el servidor */}
      <img
        src={`/resultado/${id}/imagen`}
        width={1200}
        height={630}
        alt={t('imageAlt', {
          name: r.nickname,
          score: r.score,
          correct: r.correct,
          total: r.total,
        })}
        className="w-full rounded-3xl shadow-2xl"
      />
      <div className="flex flex-wrap justify-center gap-3">
        {r.quizId ? (
          <Link href={`/quiz/${r.quizId}`} className={buttonClass('primary', 'lg')}>
            ⚡ {t('playThisQuiz')}
          </Link>
        ) : (
          <Link href="/biblioteca" className={buttonClass('primary', 'lg')}>
            ⚡ {t('playToo')}
          </Link>
        )}
        <Link href="/solo" className={buttonClass('outline', 'lg')}>
          {t('playSolo')}
        </Link>
      </div>
    </div>
  );
}
