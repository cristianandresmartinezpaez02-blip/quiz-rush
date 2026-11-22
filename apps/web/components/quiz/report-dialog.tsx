'use client';
// Reportar un quiz, comentario o usuario.
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { REPORT_REASONS } from '@quiz-rush/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';

export function ReportDialog({
  open,
  onClose,
  targetType,
  targetId,
  onReported,
}: {
  open: boolean;
  onClose: () => void;
  targetType: 'QUIZ' | 'COMMENT' | 'USER';
  targetId: string;
  onReported?: () => void;
}) {
  const t = useTranslations('quiz');
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number] | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    if (!reason) return;
    setSending(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, reason, details: details.trim() || null }),
      });
      if (res.status === 409) toast.info(t('alreadyReported'));
      else if (!res.ok) throw new Error();
      else toast.success(t('reportSent'));
      onReported?.();
      onClose();
    } catch {
      toast.error(t('actionError'));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('reportTitle')}>
      <fieldset className="mb-4">
        <legend className="mb-2 text-sm text-muted">{t('reportWhy')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {REPORT_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={reason === r}
              onClick={() => setReason(r)}
              className={cn(
                'cursor-pointer rounded-xl border-2 px-3 py-2 text-left text-sm font-bold',
                reason === r ? 'border-danger bg-danger/10' : 'border-line hover:border-danger/50',
              )}
            >
              {t(`reportReasons.${r}`)}
            </button>
          ))}
        </div>
      </fieldset>
      <Textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        maxLength={500}
        placeholder={t('reportDetails')}
        aria-label={t('reportDetails')}
      />
      <Button
        variant="danger"
        className="mt-4 w-full"
        onClick={send}
        disabled={!reason}
        loading={sending}
      >
        {t('sendReport')}
      </Button>
    </Modal>
  );
}
