// Certificado de una tarea aprobada: imprimible (o "guardar como PDF") y verificable con su enlace.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Logo } from '@/components/ui/logo';
import { PrintButton } from '@/components/classes/print-button';
import { getCertificate } from '@/lib/class-service';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('certificate');
  return { title: t('title'), robots: { index: false } };
}

export default async function CertificatePage({ params }: Props) {
  const { id } = await params;
  const cert = await getCertificate(id);
  if (!cert) notFound();
  const [t, format] = await Promise.all([getTranslations('certificate'), getFormatter()]);
  return (
    <main
      id="contenido"
      className="flex min-h-dvh flex-col items-center gap-6 bg-[#f6f3ea] px-4 py-10 text-[#1a1640] print:bg-white print:p-0"
    >
      <article className="relative w-full max-w-3xl rounded-[2rem] border-[10px] border-double border-[#7c5cff] bg-white p-10 text-center shadow-2xl print:max-w-none print:rounded-none print:shadow-none">
        <div className="flex justify-center">
          <Logo />
        </div>
        <p className="mt-6 text-sm font-black tracking-[0.3em] text-[#7c5cff] uppercase">
          {t('title')}
        </p>
        <p className="mt-6 text-lg">{t('awardedTo')}</p>
        <h1 className="font-display text-5xl font-black">{cert.student}</h1>
        <p className="mx-auto mt-6 max-w-xl text-lg">
          {t('forCompleting', { assignment: cert.assignment, className: cert.className })}
        </p>
        <p className="mt-4 font-display text-4xl font-black text-[#12a150]">
          {t('score', { percent: cert.percent })}
        </p>
        <div className="mt-10 flex flex-wrap items-end justify-between gap-6 text-left text-sm">
          <div>
            <p className="font-display text-xl font-black">{cert.teacher}</p>
            <p className="border-t-2 border-[#1a1640] pt-1">{t('teacher')}</p>
          </div>
          <div className="text-right">
            <p className="font-bold">
              {format.dateTime(new Date(cert.date), { dateStyle: 'long' })}
            </p>
            <p className="text-xs text-[#5d5a7a]">{t('verify', { code: cert.code })}</p>
          </div>
        </div>
        <span className="absolute top-6 right-8 hidden text-6xl sm:block" aria-hidden="true">
          🏅
        </span>
      </article>
      <PrintButton label={t('print')} />
    </main>
  );
}
