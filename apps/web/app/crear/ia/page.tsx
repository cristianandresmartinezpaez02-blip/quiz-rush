// Generador de quizzes con IA (crea un borrador y abre el editor).
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AiGenerator } from '@/components/create/ai-generator';
import { Logo } from '@/components/ui/logo';
import { aiStatus, remainingGenerations } from '@/lib/ai/client';
import { requirePageUser } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ai');
  return { title: t('title'), robots: { index: false } };
}

export default async function AiGeneratorPage() {
  const user = await requirePageUser('/crear/ia');
  const t = await getTranslations('ai');
  const status = aiStatus();
  const remaining = status === 'off' ? 0 : await remainingGenerations(user.id);
  return (
    <div className="bg-rush min-h-dvh">
      <header className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
        <Link href="/mis-quizzes" aria-label="Quiz_Rush">
          <Logo />
        </Link>
      </header>
      <main id="contenido" className="mx-auto max-w-4xl px-4 pb-16">
        <h1 className="text-4xl font-extrabold">✨ {t('title')}</h1>
        <p className="mt-1 mb-6 text-muted">{t('subtitle')}</p>
        {user.isAnonymous ? (
          <p className="card p-5 font-bold">{t('accountRequired')}</p>
        ) : (
          <AiGenerator status={status} remaining={remaining} />
        )}
      </main>
    </div>
  );
}
