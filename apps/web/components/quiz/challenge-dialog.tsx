'use client';
// Crear un desafío por enlace: el quiz queda congelado y cualquiera con el enlace lo juega
// una vez antes de la fecha límite; todos compiten en el mismo ranking.
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { CopyLink } from '@/components/solo/copy-link';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { apiFetch } from '@/lib/client-api';
import { cn } from '@/lib/utils';

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export function ChallengeDialog({
  open,
  onClose,
  quizId,
  title,
}: {
  open: boolean;
  onClose: () => void;
  quizId: string;
  title: string;
}) {
  const t = useTranslations('solo');
  const te = useTranslations('errors');
  const [days, setDays] = useState(3);
  const [busy, setBusy] = useState(false);
  const [id, setId] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    try {
      const res = await apiFetch<{ id: string }>('/api/challenges', {
        method: 'POST',
        body: { quizId, days },
      });
      setId(res.id);
    } catch (err) {
      const code = (err as Error).message;
      toast.error(te.has(code) ? te(code as 'INTERNAL') : te('INTERNAL'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        onClose();
        setId(null);
      }}
      title={`🎯 ${t('createChallenge')}`}
    >
      {id ? (
        <div className="flex flex-col gap-4">
          <p className="font-bold">{t('challengeReady')}</p>
          <CopyLink url={`${appUrl}/desafio/${id}`} title={t('challengeTitle', { quiz: title })} />
          <Button asChild>
            <Link href={`/desafio/${id}`}>{t('openChallenge')}</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">{t('challengeHelp')}</p>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">{t('challengeDuration')}</legend>
            <div className="grid grid-cols-3 gap-2">
              {[1, 3, 7].map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={days === d}
                  onClick={() => setDays(d)}
                  className={cn(
                    'cursor-pointer rounded-xl border-2 py-2 font-bold',
                    days === d
                      ? 'border-accent bg-accent text-accent-ink'
                      : 'border-line hover:border-accent/60',
                  )}
                >
                  {t('days', { count: d })}
                </button>
              ))}
            </div>
          </fieldset>
          <Button onClick={create} loading={busy}>
            {t('createChallenge')}
          </Button>
        </div>
      )}
    </Modal>
  );
}
