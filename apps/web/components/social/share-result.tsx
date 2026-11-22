'use client';
// Compartir un resultado: en el móvil abre el menú nativo (con la imagen si se puede); si no,
// copia el enlace. El enlace /resultado/<id> muestra la tarjeta también en las redes.
import { Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export function ShareResultButton({ shareId, className }: { shareId: string; className?: string }) {
  const t = useTranslations('share');
  const [busy, setBusy] = useState(false);
  const url = `${appUrl}/resultado/${shareId}`;

  async function share() {
    setBusy(true);
    try {
      if (navigator.share) {
        const data: ShareData = { title: 'Quiz_Rush', text: t('shareText'), url };
        // Con la imagen adjunta si el navegador lo admite (Android/iOS)
        try {
          const blob = await fetch(`/resultado/${shareId}/imagen`).then((r) =>
            r.ok ? r.blob() : null,
          );
          if (blob) {
            const file = new File([blob], 'quiz-rush.png', { type: 'image/png' });
            if (navigator.canShare?.({ files: [file] })) data.files = [file];
          }
        } catch {
          /* sin imagen: se comparte solo el enlace */
        }
        await navigator.share(data);
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success(t('linkCopied'));
    } catch (err) {
      // Cancelar el menú nativo no es un error
      if ((err as Error).name !== 'AbortError') {
        await navigator.clipboard?.writeText(url).catch(() => {});
        toast.success(t('linkCopied'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void share()}
      disabled={busy}
      data-share-id={shareId}
      className={cn(
        'flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[#ffe14d] px-6 py-3 font-display text-lg font-extrabold text-[#1a1640] shadow-[0_5px_0_0_#c9a400] transition active:translate-y-1 active:shadow-none disabled:opacity-60',
        className,
      )}
    >
      <Share2 className="size-5" /> {t('share')}
    </button>
  );
}
