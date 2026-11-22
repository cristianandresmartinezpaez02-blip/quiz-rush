'use client';
// Enlace para compartir con botón de copiar (y compartir nativo en el celular).
import { Check, Copy, Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';

export function CopyLink({ url, title }: { url: string; title?: string }) {
  const t = useTranslations('solo');
  const [copied, setCopied] = useState(false);
  // En el servidor no hay navigator: se decide en el navegador sin desajustes de hidratación
  const canShare = useSyncExternalStore(
    () => () => {},
    () => 'share' in navigator,
    () => false,
  );
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-surface-2 p-2">
      <input
        readOnly
        value={url}
        aria-label={t('shareLink')}
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 bg-transparent px-2 text-sm font-bold outline-none"
      />
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(url).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="flex cursor-pointer items-center gap-1 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-accent-ink"
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? t('copied') : t('copy')}
      </button>
      {canShare && (
        <button
          type="button"
          aria-label={t('share')}
          onClick={() => navigator.share({ url, title }).catch(() => {})}
          className="grid size-9 cursor-pointer place-items-center rounded-xl bg-surface"
        >
          <Share2 className="size-4" />
        </button>
      )}
    </div>
  );
}
