'use client';
// Empezar un quiz desde una plantilla (repaso, rompehielos, encuesta, evaluación…).
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { QUIZ_TEMPLATES } from '@quiz-rush/shared';
import { Modal } from '@/components/ui/modal';
import { apiFetch } from '@/lib/client-api';
import { cn } from '@/lib/utils';

export function TemplatesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('create');
  const tt = useTranslations('templates');
  const te = useTranslations('errors');
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function use(template: string) {
    setBusy(template);
    try {
      const { id } = await apiFetch<{ id: string }>('/api/quizzes', {
        method: 'POST',
        body: { language: locale === 'en' ? 'en' : 'es', template },
      });
      router.push(`/crear/${id}`);
    } catch (err) {
      const code = (err as Error).message;
      toast.error(te.has(code) ? te(code as 'INTERNAL') : te('INTERNAL'));
      setBusy(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`🧩 ${t('templatesTitle')}`}>
      <ul className="grid gap-3 sm:grid-cols-2">
        {QUIZ_TEMPLATES.map((tpl) => (
          <li key={tpl.id}>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => use(tpl.id)}
              className={cn(
                'flex h-full w-full cursor-pointer flex-col items-start gap-1 rounded-2xl border-2 border-line p-4 text-left transition hover:-translate-y-0.5 hover:border-accent disabled:cursor-wait',
                busy === tpl.id && 'animate-pulse border-accent',
              )}
            >
              <span className="text-3xl" aria-hidden="true">
                {tpl.emoji}
              </span>
              <span className="font-extrabold">{tt(`${tpl.id}.name`)}</span>
              <span className="text-sm text-muted">{tt(`${tpl.id}.desc`)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
