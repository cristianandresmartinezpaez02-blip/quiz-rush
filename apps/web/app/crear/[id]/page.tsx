// Editor de quizzes (pantalla completa, sin la cabecera global).
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Editor } from '@/components/editor/editor';
import { ApiError } from '@/lib/api';
import { getQuizForEditor } from '@/lib/quiz-service';
import { requirePageUser } from '@/lib/session';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('create'), robots: { index: false } };
}

export default async function EditorPage({ params }: Props) {
  const { id } = await params;
  const user = await requirePageUser(`/crear/${id}`);
  const state = await getQuizForEditor(id, user.id).catch((err: unknown) => {
    // Quiz inexistente o de otra persona: 404 (no revelamos que existe)
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) notFound();
    throw err;
  });
  return <Editor initial={state} />;
}
