'use client';
// Generador de quizzes con IA: elegir el material (tema, texto, PDF, enlace o foto), ajustar el
// quiz y crearlo como borrador para revisarlo en el editor.
import { AnimatePresence, motion } from 'motion/react';
import { FileText, Globe, ImageIcon, Lightbulb, Sparkles, Type } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AI_LIMITS,
  AI_QUESTION_TYPES,
  DIFFICULTIES,
  QUESTION_TYPE_EMOJI,
  type AiSource,
} from '@quiz-rush/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SOURCES: { id: AiSource; icon: typeof Type }[] = [
  { id: 'topic', icon: Lightbulb },
  { id: 'text', icon: Type },
  { id: 'pdf', icon: FileText },
  { id: 'url', icon: Globe },
  { id: 'image', icon: ImageIcon },
];

export function AiGenerator({
  status,
  remaining,
}: {
  status: 'live' | 'mock' | 'off';
  remaining: number;
}) {
  const t = useTranslations('ai');
  const tq = useTranslations('questionTypes');
  const te = useTranslations('errors');
  const td = useTranslations('editor.difficulties');
  const locale = useLocale();
  const router = useRouter();
  const [source, setSource] = useState<AiSource>('topic');
  const [input, setInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [count, setCount] = useState<number>(AI_LIMITS.questions.default);
  const [types, setTypes] = useState<string[]>(['MULTIPLE_CHOICE', 'TRUE_FALSE']);
  const [difficulty, setDifficulty] = useState<string>('MEDIUM');
  const [language, setLanguage] = useState<'es' | 'en'>(locale === 'en' ? 'en' : 'es');
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const needsFile = source === 'pdf' || source === 'image';
  const ready =
    status !== 'off' &&
    remaining > 0 &&
    types.length > 0 &&
    (needsFile
      ? !!file
      : source === 'text'
        ? input.trim().length >= 200
        : input.trim().length >= 3);

  async function generate() {
    setBusy(true);
    try {
      const form = new FormData();
      form.append(
        'options',
        JSON.stringify({
          source,
          input: needsFile ? '' : input,
          instructions,
          count,
          types,
          difficulty,
          language,
        }),
      );
      if (needsFile && file) form.append('file', file);
      const res = await fetch('/api/ai/generate', { method: 'POST', body: form });
      const data = (await res.json().catch(() => null)) as {
        id?: string;
        discarded?: number;
        error?: string;
      } | null;
      if (!res.ok || !data?.id) {
        const code = data?.error ?? 'INTERNAL';
        toast.error(te.has(code) ? te(code as 'INTERNAL') : te('INTERNAL'));
        setBusy(false);
        return;
      }
      if (data.discarded) toast.info(t('discarded', { count: data.discarded }));
      toast.success(t('done'));
      router.push(`/crear/${data.id}`);
    } catch {
      toast.error(te('OFFLINE'));
      setBusy(false);
    }
  }

  if (busy) {
    return (
      <div
        className="m-auto flex max-w-md flex-col items-center gap-5 py-20 text-center"
        role="status"
        aria-live="polite"
      >
        <motion.span
          animate={{ rotate: [0, 12, -12, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          className="text-7xl"
          aria-hidden="true"
        >
          ✨
        </motion.span>
        <h2 className="text-2xl font-extrabold">{t('working')}</h2>
        <p className="text-muted">{t('workingHelp')}</p>
        <div className="h-2 w-64 overflow-hidden rounded-full bg-surface-2">
          <motion.div
            className="h-full w-1/3 rounded-full bg-gradient-to-r from-accent to-primary"
            animate={{ x: ['-100%', '300%'] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {status === 'off' && (
        <p
          role="alert"
          className="rounded-2xl border-2 border-accent/40 bg-accent/10 p-4 font-bold"
        >
          🔌 {t('off')}
        </p>
      )}
      {status === 'mock' && (
        <p
          role="status"
          className="rounded-2xl border-2 border-primary/40 bg-primary/10 p-4 text-sm font-bold"
        >
          🧪 {t('mock')}
        </p>
      )}

      <section className="card p-5" aria-labelledby="ai-source">
        <h2 id="ai-source" className="mb-3 text-lg font-extrabold">
          1. {t('sourceTitle')}
        </h2>
        <div role="tablist" aria-label={t('sourceTitle')} className="mb-4 flex flex-wrap gap-2">
          {SOURCES.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={source === id}
              onClick={() => {
                setSource(id);
                setFile(null);
              }}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-sm font-extrabold',
                source === id ? 'bg-accent text-accent-ink' : 'bg-surface-2 hover:bg-line',
              )}
            >
              <Icon className="size-4" /> {t(`sources.${id}`)}
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={source}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {source === 'topic' && (
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={AI_LIMITS.topicChars}
                placeholder={t('topicPlaceholder')}
                aria-label={t('sources.topic')}
                className="h-14 w-full rounded-2xl border-2 border-line bg-surface px-4 text-lg font-bold outline-none focus:border-accent"
              />
            )}
            {source === 'url' && (
              <input
                type="url"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="https://…"
                aria-label={t('sources.url')}
                className="h-14 w-full rounded-2xl border-2 border-line bg-surface px-4 text-lg font-bold outline-none focus:border-accent"
              />
            )}
            {source === 'text' && (
              <>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={8}
                  maxLength={AI_LIMITS.textChars}
                  placeholder={t('textPlaceholder')}
                  aria-label={t('sources.text')}
                  className="w-full resize-y rounded-2xl border-2 border-line bg-surface p-4 outline-none focus:border-accent"
                />
                <p className="mt-1 text-right text-xs text-muted">
                  {input.length.toLocaleString()} / {AI_LIMITS.textChars.toLocaleString()} ·{' '}
                  {t('minText')}
                </p>
              </>
            )}
            {needsFile && (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  accept={
                    source === 'pdf'
                      ? 'application/pdf'
                      : 'image/jpeg,image/png,image/webp,image/gif'
                  }
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (f && f.size > AI_LIMITS.fileBytes) {
                      toast.error(te('AI_FILE_TOO_LARGE'));
                      return;
                    }
                    setFile(f);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line p-8 font-bold hover:border-accent"
                >
                  {source === 'pdf' ? (
                    <FileText className="size-8" />
                  ) : (
                    <ImageIcon className="size-8" />
                  )}
                  {file ? file.name : t(source === 'pdf' ? 'choosePdf' : 'chooseImage')}
                  <span className="text-xs font-normal text-muted">{t('fileLimit')}</span>
                </button>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </section>

      <section className="card grid gap-5 p-5 md:grid-cols-2" aria-labelledby="ai-options">
        <h2 id="ai-options" className="text-lg font-extrabold md:col-span-2">
          2. {t('optionsTitle')}
        </h2>
        <label className="flex flex-col gap-2 text-sm font-bold">
          {t('count', { count })}
          <input
            type="range"
            min={AI_LIMITS.questions.min}
            max={AI_LIMITS.questions.max}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="accent-[var(--accent)]"
          />
        </label>
        <fieldset>
          <legend className="mb-2 text-sm font-bold">{t('difficulty')}</legend>
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={difficulty === d}
                onClick={() => setDifficulty(d)}
                className={cn(
                  'cursor-pointer rounded-xl py-2 text-sm font-extrabold',
                  difficulty === d ? 'bg-primary text-primary-ink' : 'text-muted hover:text-fg',
                )}
              >
                {td(d)}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="md:col-span-2">
          <legend className="mb-2 text-sm font-bold">{t('types')}</legend>
          <div className="flex flex-wrap gap-2">
            {AI_QUESTION_TYPES.map((type) => {
              const on = types.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setTypes((list) => (on ? list.filter((x) => x !== type) : [...list, type]))
                  }
                  className={cn(
                    'flex cursor-pointer items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-bold',
                    on ? 'border-accent bg-accent/15' : 'border-line hover:border-accent/60',
                  )}
                >
                  <span aria-hidden="true">{QUESTION_TYPE_EMOJI[type]}</span> {tq(type)}
                </button>
              );
            })}
          </div>
        </fieldset>
        <label className="flex flex-col gap-2 text-sm font-bold">
          {t('language')}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value === 'en' ? 'en' : 'es')}
            className="h-11 rounded-xl border-2 border-line bg-surface px-3"
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm font-bold">
          {t('instructions')}
          <input
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            maxLength={500}
            placeholder={t('instructionsPlaceholder')}
            className="h-11 rounded-xl border-2 border-line bg-surface px-3 font-normal"
          />
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" disabled={!ready} onClick={generate}>
          <Sparkles className="size-5" /> {t('generate')}
        </Button>
        {status !== 'off' && (
          <p className="text-sm text-muted">{t('remaining', { count: remaining })}</p>
        )}
        <Link href="/mis-quizzes" className="ml-auto text-sm font-bold underline">
          {t('back')}
        </Link>
      </div>
      <p className="text-xs text-muted">{t('reviewNote')}</p>
    </div>
  );
}
