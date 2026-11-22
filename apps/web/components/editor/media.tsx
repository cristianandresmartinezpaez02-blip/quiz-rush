'use client';
// Multimedia de las preguntas: subir archivo o pegar enlace (imagen, GIF, audio o YouTube),
// y su visualización en la vista previa.
import { ImagePlus, Link2, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import type { QuestionMedia } from '@quiz-rush/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';

/** Extrae el id de un video de YouTube de cualquier formato de enlace habitual. */
export function youtubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/,
  );
  return m?.[1] ?? null;
}

/** Deduce el tipo de multimedia a partir de un enlace pegado. */
export function mediaFromUrl(raw: string): QuestionMedia | null {
  const url = raw.trim();
  if (!/^https?:\/\//i.test(url)) return null;
  if (youtubeId(url)) return { kind: 'youtube', url };
  const path = url.split(/[?#]/)[0]!.toLowerCase();
  if (path.endsWith('.gif')) return { kind: 'gif', url };
  if (/\.(png|jpe?g|webp|avif|svg)$/.test(path)) return { kind: 'image', url };
  if (/\.(mp3|ogg|wav|m4a|webm)$/.test(path)) return { kind: 'audio', url };
  // Enlaces de imagen sin extensión (CDN): se asume imagen
  if (/images\.unsplash\.com|res\.cloudinary\.com|i\.imgur\.com/.test(url))
    return { kind: 'image', url };
  return null;
}

/** Sube un archivo al API y devuelve su URL y tipo. */
export async function uploadMedia(file: File): Promise<QuestionMedia> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/media', { method: 'POST', body: form });
  if (!res.ok) throw new Error(String(res.status));
  const data = (await res.json()) as { url: string; kind: 'IMAGE' | 'GIF' | 'AUDIO' };
  const kind = data.kind === 'GIF' ? 'gif' : data.kind === 'AUDIO' ? 'audio' : 'image';
  // Las URLs locales se guardan relativas (/api/media/file/…) para no atarlas a un dominio
  return { kind, url: data.url };
}

export function MediaView({ media, className }: { media: QuestionMedia; className?: string }) {
  if (media.kind === 'youtube') {
    const id = youtubeId(media.url);
    if (!id) return null;
    const params = new URLSearchParams({ rel: '0', modestbranding: '1' });
    if (media.start) params.set('start', String(media.start));
    if (media.end) params.set('end', String(media.end));
    return (
      <div className={className}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?${params}`}
          title="YouTube"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          className="aspect-video w-full rounded-2xl"
        />
      </div>
    );
  }
  if (media.kind === 'audio') {
    return (
      <div className={className}>
        <div className="flex items-center gap-3 rounded-2xl bg-black/30 p-4">
          <span className="text-3xl" aria-hidden="true">
            🎧
          </span>
          <audio controls src={media.url} className="w-full" preload="metadata" />
        </div>
      </div>
    );
  }
  return (
    <div className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={media.url}
        alt=""
        className="mx-auto max-h-64 rounded-2xl object-contain shadow-lg"
      />
    </div>
  );
}

export function MediaPicker({
  open,
  onClose,
  onPick,
  accept = 'image/*,audio/*',
}: {
  open: boolean;
  onClose: () => void;
  onPick: (media: QuestionMedia) => void;
  accept?: string;
}) {
  const t = useTranslations('editor');
  const tc = useTranslations('common');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      onPick(await uploadMedia(file));
      onClose();
    } catch {
      toast.error(t('uploadError'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function onUrl() {
    const media = mediaFromUrl(url);
    if (!media) {
      setError(t('mediaInvalid'));
      return;
    }
    onPick(media);
    setUrl('');
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t('addMedia')}>
      <div className="flex flex-col gap-5">
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          hidden
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void onFile(e.dataTransfer.files[0]);
          }}
          disabled={uploading}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line p-8 transition-colors hover:border-accent hover:bg-accent/5"
        >
          <Upload className={uploading ? 'size-8 animate-bounce' : 'size-8'} />
          <span className="font-bold">{uploading ? t('uploading') : t('uploadFile')}</span>
          <span className="text-xs text-muted">JPG, PNG, WebP, GIF, MP3, OGG · máx. 10 MB</span>
        </button>
        <div>
          <label htmlFor="media-url" className="mb-1.5 flex items-center gap-2 text-sm font-bold">
            <Link2 className="size-4" /> {t('pasteUrl')}
          </label>
          <div className="flex gap-2">
            <Input
              id="media-url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onUrl())}
              placeholder="https://youtu.be/…"
              aria-invalid={!!error || undefined}
            />
            <Button type="button" onClick={onUrl} disabled={!url.trim()}>
              {tc('add')}
            </Button>
          </div>
          {error && (
            <p role="alert" className="mt-1 text-xs font-semibold text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Zona de multimedia en la vista previa: muestra el medio o un botón para añadirlo. */
export function MediaSlot({
  media,
  onChange,
  readOnly,
}: {
  media: QuestionMedia | null | undefined;
  onChange: (media: QuestionMedia | null) => void;
  readOnly?: boolean;
}) {
  const t = useTranslations('editor');
  const [open, setOpen] = useState(false);

  if (media) {
    return (
      <div className="group relative mx-auto w-full max-w-xl">
        <MediaView media={media} />
        {!readOnly && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={t('removeMedia')}
            className="absolute top-2 right-2 grid size-9 cursor-pointer place-items-center rounded-xl bg-black/60 text-white opacity-100 transition-opacity group-hover:opacity-100 sm:opacity-0"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
    );
  }
  if (readOnly) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto flex h-36 w-full max-w-xl cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/30 bg-white/5 text-white/80 transition-colors hover:border-white/70 hover:bg-white/10"
      >
        <ImagePlus className="size-8" />
        <span className="text-sm font-bold">{t('media')}</span>
      </button>
      <MediaPicker open={open} onClose={() => setOpen(false)} onPick={onChange} />
    </>
  );
}
