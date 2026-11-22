// Unirse a una clase desde el enlace que comparte el profe (/clases/unirse?code=ABC234).
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { classCodeSchema } from '@quiz-rush/shared';
import { ApiError } from '@/lib/api';
import { joinClass } from '@/lib/class-service';
import { requirePageUser } from '@/lib/session';

type Props = { searchParams: Promise<{ code?: string }> };

export default async function JoinClassPage({ searchParams }: Props) {
  const { code } = await searchParams;
  const user = await requirePageUser(`/clases/unirse?code=${encodeURIComponent(code ?? '')}`);
  const parsed = classCodeSchema.safeParse(code ?? '');
  let classId: string | null = null;
  if (parsed.success) {
    classId = await joinClass(user.id, parsed.data).catch((err) => {
      if (err instanceof ApiError) return null;
      throw err;
    });
  }
  if (classId) redirect(`/clases/${classId}`);
  const t = await getTranslations('classes');
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-6xl" aria-hidden="true">
        🔍
      </p>
      <h1 className="mt-4 text-2xl font-extrabold">{t('codeNotFound')}</h1>
      <Link href="/clases" className="mt-4 inline-block font-bold underline">
        {t('title')}
      </Link>
    </div>
  );
}
