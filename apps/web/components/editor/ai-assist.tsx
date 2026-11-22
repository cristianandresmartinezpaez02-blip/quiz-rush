'use client';
// Ayudas de IA en el editor: sugerir distractores (opciones incorrectas plausibles) y escribir la
// explicación de una pregunta. Solo aparecen si la IA está disponible.
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { createOption, LIMITS, type QuestionDoc } from '@quiz-rush/shared';
import { apiFetch } from '@/lib/client-api';
import { useEditorStore } from '@/stores/editor-store';
import { cn } from '@/lib/utils';

let statusPromise: Promise<'live' | 'mock' | 'off'> | null = null;

/** Estado de la IA (se pide una vez por página). */
export function useAiAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    statusPromise ??= apiFetch<{ status: 'live' | 'mock' | 'off' }>('/api/ai')
      .then((r) => r.status)
      .catch(() => 'off' as const);
    let alive = true;
    void statusPromise.then((s) => alive && setAvailable(s !== 'off'));
    return () => {
      alive = false;
    };
  }, []);
  return available;
}

function useAssist() {
  const te = useTranslations('errors');
  const [busy, setBusy] = useState(false);
  const run = async <T,>(body: Record<string, unknown>): Promise<T | null> => {
    setBusy(true);
    try {
      return await apiFetch<T>('/api/ai/assist', { method: 'POST', body });
    } catch (err) {
      const code = (err as Error).message;
      toast.error(te.has(code) ? te(code as 'INTERNAL') : te('INTERNAL'));
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

const btn =
  'flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold transition disabled:cursor-wait disabled:opacity-60';

/** Completa las opciones incorrectas vacías (o añade hasta 4) con distractores sugeridos. */
export function SuggestDistractors({
  question,
  language,
}: {
  question: QuestionDoc;
  language: string;
}) {
  const t = useTranslations('editor.ai');
  const update = useEditorStore((s) => s.updateQuestion);
  const available = useAiAvailable();
  const { busy, run } = useAssist();
  const correct = question.options.filter((o) => o.isCorrect && o.text.trim()).map((o) => o.text);
  const wrong = question.options.filter((o) => !o.isCorrect && o.text.trim()).map((o) => o.text);
  const empty = question.options.filter((o) => !o.isCorrect && !o.text.trim()).length;
  const wanted = Math.max(empty, Math.max(0, 4 - question.options.length));
  if (!available || question.type !== 'MULTIPLE_CHOICE') return null;
  const disabled = busy || !question.prompt.trim() || !correct.length || wanted === 0;

  return (
    <button
      type="button"
      disabled={disabled}
      title={!correct.length ? t('needCorrect') : wanted === 0 ? t('noRoom') : undefined}
      onClick={async () => {
        const res = await run<{ distractors: string[] }>({
          action: 'distractors',
          language: language === 'en' ? 'en' : 'es',
          prompt: question.prompt,
          correct,
          wrong,
          count: Math.min(5, wanted),
        });
        if (!res?.distractors.length) return;
        const list = [...res.distractors];
        update(question.id, (q) => {
          for (const o of q.options)
            if (!o.isCorrect && !o.text.trim() && list.length) o.text = list.shift()!;
          while (list.length && q.options.length < LIMITS.options.max)
            q.options.push(createOption(list.shift()!));
        });
        toast.success(t('distractorsDone'));
      }}
      className={cn(btn, 'bg-white/90 text-[#1a1640] hover:bg-white')}
    >
      <Sparkles className={cn('size-4', busy && 'animate-spin')} />{' '}
      {busy ? t('thinking') : t('suggestDistractors')}
    </button>
  );
}

/** Escribe la explicación de la respuesta correcta. */
export function WriteExplanation({
  question,
  language,
}: {
  question: QuestionDoc;
  language: string;
}) {
  const t = useTranslations('editor.ai');
  const update = useEditorStore((s) => s.updateQuestion);
  const available = useAiAvailable();
  const { busy, run } = useAssist();
  const correct = correctAnswers(question);
  if (!available || !correct.length) return null;

  return (
    <button
      type="button"
      disabled={busy || !question.prompt.trim()}
      onClick={async () => {
        const res = await run<{ explanation: string }>({
          action: 'explanation',
          language: language === 'en' ? 'en' : 'es',
          prompt: question.prompt,
          correct,
        });
        if (res?.explanation) {
          update(
            question.id,
            (q) => void (q.explanation = res.explanation.slice(0, LIMITS.explanation.max)),
          );
        }
      }}
      className={cn(btn, 'bg-accent/15 text-accent hover:bg-accent/25')}
    >
      <Sparkles className={cn('size-4', busy && 'animate-spin')} />{' '}
      {busy ? t('thinking') : t('writeExplanation')}
    </button>
  );
}

/** Texto de la respuesta correcta según el tipo (para pedir la explicación). */
function correctAnswers(q: QuestionDoc): string[] {
  switch (q.type) {
    case 'TYPE_ANSWER':
      return (q.config.accepted ?? []).filter(Boolean).slice(0, 3);
    case 'SLIDER':
      return q.config.slider
        ? [`${q.config.slider.correct}${q.config.slider.unit ? ` ${q.config.slider.unit}` : ''}`]
        : [];
    case 'FILL_BLANK':
      return (q.config.blanks ?? [])
        .map((b) => b[0] ?? '')
        .filter(Boolean)
        .slice(0, 5);
    case 'ORDER':
      return [
        q.options
          .map((o) => o.text)
          .join(' → ')
          .slice(0, 120),
      ].filter(Boolean);
    case 'MATCH':
      return (q.config.pairs ?? []).slice(0, 6).map((p) => `${p.left} = ${p.right}`.slice(0, 120));
    case 'POLL':
    case 'WORD_CLOUD':
    case 'OPEN_VOTE':
    case 'DRAW':
      return [];
    default:
      return q.options
        .filter((o) => o.isCorrect && o.text.trim())
        .map((o) => o.text)
        .slice(0, 6);
  }
}
