'use client';
// Compartir: copiar enlace, código QR descargable, redes sociales y compartir nativo del móvil.
import { Check, Copy, Download, Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { QRCodeCanvas } from 'qrcode.react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

export function ShareDialog({
  open,
  onClose,
  url,
  title,
}: {
  open: boolean;
  onClose: () => void;
  url: string;
  title: string;
}) {
  const t = useTranslations('quiz');
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const text = t('shareText', { title });
  const enc = encodeURIComponent;

  const networks = [
    { name: 'WhatsApp', color: '#25D366', href: `https://wa.me/?text=${enc(`${text} ${url}`)}` },
    {
      name: 'X',
      color: '#000000',
      href: `https://x.com/intent/post?text=${enc(text)}&url=${enc(url)}`,
    },
    {
      name: 'Facebook',
      color: '#1877F2',
      href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
    },
    {
      name: 'Telegram',
      color: '#26A5E4',
      href: `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`,
    },
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(t('linkCopied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('copyFailed'));
    }
  }

  function downloadQr() {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'quiz-rush-qr.png';
    a.click();
  }

  const canNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;

  return (
    <Modal open={open} onClose={onClose} title={t('share')}>
      <div className="flex flex-col gap-5">
        <div className="flex gap-2">
          <input
            readOnly
            value={url}
            aria-label={t('shareLink')}
            onFocus={(e) => e.currentTarget.select()}
            className="h-11 min-w-0 flex-1 rounded-xl border-2 border-line bg-surface-2 px-3 text-sm font-semibold"
          />
          <Button onClick={copy} size="md">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? t('copied') : t('copy')}
          </Button>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div ref={qrRef} className="rounded-2xl bg-white p-3">
            <QRCodeCanvas value={url} size={180} level="M" marginSize={1} fgColor="#1a1640" />
          </div>
          <Button variant="outline" size="sm" onClick={downloadQr}>
            <Download className="size-4" /> {t('downloadQr')}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {networks.map((n) => (
            <a
              key={n.name}
              href={n.href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl py-2.5 text-center text-sm font-extrabold text-white transition-transform hover:-translate-y-0.5"
              style={{ background: n.color }}
            >
              {n.name}
            </a>
          ))}
        </div>

        {canNativeShare && (
          <Button
            variant="accent"
            onClick={() => navigator.share({ title, text, url }).catch(() => {})}
          >
            <Share2 className="size-4" /> {t('shareMore')}
          </Button>
        )}
      </div>
    </Modal>
  );
}
