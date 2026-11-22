'use client';
// Respuestas: fichas grandes para el proyector, botonera para el celular y barras de distribución.
// Cada opción combina color + forma + icono (accesible para daltonismo).
import { AnimatePresence, motion } from 'motion/react';
import { Check, Send, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { PublicQuestion, RevealData } from '@quiz-rush/shared';
import { AnswerIcon, answerStyle } from '@/components/ui/answer-shape';
import { cn } from '@/lib/utils';

/** Fichas de respuesta en la pantalla grande (sin interacción). */
export function ScreenAnswers({
  question,
  reveal,
}: {
  question: PublicQuestion;
  reveal: RevealData | null;
}) {
  const t = useTranslations('game');
  if (question.type === 'TYPE_ANSWER') {
    return (
      <div className="rounded-3xl bg-white/95 px-6 py-5 text-center text-2xl font-extrabold text-[#1a1640] shadow-xl">
        {reveal ? (
          <span>✅ {reveal.acceptedAnswers.join(' · ')}</span>
        ) : (
          <span className="opacity-60">⌨️ {t('typeYourAnswer')}</span>
        )}
      </div>
    );
  }
  return (
    <ul className={cn('grid gap-3', question.options.length > 2 ? 'grid-cols-2' : 'grid-cols-2')}>
      {question.options.map((o, i) => {
        const correct = reveal?.correctOptionIds.includes(o.id);
        const dim = reveal && question.type !== 'POLL' && !correct;
        return (
          <motion.li
            key={o.id}
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: dim ? 0.35 : 1, y: 0, scale: correct ? 1.03 : 1 }}
            transition={{
              delay: reveal ? 0 : i * 0.08,
              type: 'spring',
              stiffness: 300,
              damping: 22,
            }}
            className={cn(
              'flex min-h-24 items-center gap-4 rounded-3xl px-5 py-4 text-[#1a1640] shadow-[0_6px_0_0_rgba(0,0,0,.25)] md:min-h-28',
              answerStyle(i).bg,
              correct && 'ring-8 ring-white',
            )}
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/35">
              <AnswerIcon index={i} className="size-7" />
            </span>
            <span className="flex-1 font-display text-2xl leading-tight font-extrabold md:text-3xl">
              {o.text}
            </span>
            {correct && question.type !== 'POLL' && (
              <span className="grid size-11 place-items-center rounded-full bg-[#12a150] text-white">
                <Check className="size-7" strokeWidth={4} />
              </span>
            )}
          </motion.li>
        );
      })}
    </ul>
  );
}

/** Barras con cuántos eligieron cada opción. */
export function Distribution({
  question,
  reveal,
}: {
  question: PublicQuestion;
  reveal: RevealData;
}) {
  const t = useTranslations('game');
  if (question.type === 'TYPE_ANSWER') {
    const top = Object.entries(reveal.distribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    return (
      <ul className="flex flex-wrap justify-center gap-2" aria-label={t('topAnswers')}>
        {top.map(([text, n]) => (
          <li
            key={text}
            className="rounded-full bg-black/35 px-4 py-2 text-lg font-bold text-white"
          >
            {text} <span className="text-primary">×{n}</span>
          </li>
        ))}
      </ul>
    );
  }
  const max = Math.max(1, ...question.options.map((o) => reveal.distribution[o.id] ?? 0));
  return (
    <div
      className="flex h-48 items-end justify-center gap-4 md:h-56"
      role="img"
      aria-label={t('distribution')}
    >
      {question.options.map((o, i) => {
        const n = reveal.distribution[o.id] ?? 0;
        const correct = reveal.correctOptionIds.includes(o.id);
        return (
          <div key={o.id} className="flex h-full w-20 flex-col items-center gap-2 md:w-28">
            <span className="font-display text-3xl font-extrabold text-white">{n}</span>
            {/* Contenedor con altura definida: la barra crece en % de él */}
            <div className="flex w-full flex-1 items-end">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(4, (n / max) * 100)}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 18, delay: i * 0.06 }}
                className={cn(
                  'w-full rounded-t-2xl',
                  answerStyle(i).bg,
                  question.type !== 'POLL' && !correct && 'opacity-40',
                )}
              />
            </div>
            <span
              className={cn(
                'grid size-10 place-items-center rounded-xl text-[#1a1640]',
                answerStyle(i).bg,
              )}
            >
              {correct && question.type !== 'POLL' ? (
                <Check className="size-6" strokeWidth={4} />
              ) : (
                <AnswerIcon index={i} className="size-5" />
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Botonera del jugador (celular). */
export function AnswerPad({
  question,
  showText,
  disabled,
  hide = [],
  onSubmit,
}: {
  question: PublicQuestion;
  showText: boolean;
  disabled: boolean;
  /** 50/50: opciones ocultas (se conservan colores y formas de las demás) */
  hide?: string[];
  onSubmit: (answer: { optionIds?: string[]; text?: string }) => void;
}) {
  const t = useTranslations('game');
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState('');

  // Teclado: 1–6 eligen la opción; con selección múltiple, Enter envía. La última versión de
  // las funciones se guarda en una ref para no volver a registrar el listener en cada render.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e: KeyboardEvent) => {
      if (disabled || question.type === 'TYPE_ANSWER' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)))
        return;
      const n = Number(e.key);
      const visible = question.options.filter((o) => !hide.includes(o.id));
      if (n >= 1 && n <= question.options.length) {
        const option = question.options[n - 1]!;
        if (!visible.includes(option)) return;
        e.preventDefault();
        if (!question.multiSelect) onSubmit({ optionIds: [option.id] });
        else
          setSelected((sel) =>
            sel.includes(option.id) ? sel.filter((x) => x !== option.id) : [...sel, option.id],
          );
      } else if (e.key === 'Enter' && question.multiSelect && selected.length) {
        e.preventDefault();
        onSubmit({ optionIds: selected });
      }
    };
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (question.type === 'TYPE_ANSWER') {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      if (text.trim()) onSubmit({ text: text.trim() });
    };
    return (
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor="typed-answer" className="sr-only">
          {t('typeYourAnswer')}
        </label>
        <input
          id="typed-answer"
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          maxLength={120}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('typeYourAnswer')}
          className="h-16 rounded-2xl bg-white px-5 font-display text-2xl font-extrabold text-[#1a1640] outline-none focus:ring-4 focus:ring-[var(--primary)]"
        />
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="flex h-16 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-primary font-display text-xl font-extrabold text-primary-ink shadow-[0_6px_0_0_var(--primary-shadow)] active:translate-y-1 active:shadow-none disabled:opacity-50"
        >
          <Send className="size-6" /> {t('send')}
        </button>
      </form>
    );
  }

  const multi = question.multiSelect;
  const toggle = (id: string) => {
    if (!multi) return onSubmit({ optionIds: [id] });
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div
        className={cn(
          'grid flex-1 gap-3',
          question.options.length > 2 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2',
        )}
      >
        {question.options.map((o, i) => {
          const on = selected.includes(o.id);
          if (hide.includes(o.id)) {
            return (
              <span
                key={o.id}
                aria-hidden="true"
                className="grid min-h-28 place-items-center rounded-3xl border-4 border-dashed border-white/30 text-4xl opacity-60"
              >
                ✂️
              </span>
            );
          }
          return (
            <motion.button
              key={o.id}
              type="button"
              disabled={disabled}
              whileTap={{ scale: 0.92 }}
              onClick={() => toggle(o.id)}
              aria-pressed={multi ? on : undefined}
              aria-label={`${i + 1}. ${o.text || answerStyle(i).label}`}
              aria-keyshortcuts={String(i + 1)}
              className={cn(
                'relative flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl p-3 text-[#1a1640] shadow-[0_6px_0_0_rgba(0,0,0,.3)] transition-opacity disabled:opacity-60',
                answerStyle(i).bg,
                on && 'ring-8 ring-white',
              )}
            >
              <span
                className="absolute top-2 left-3 hidden font-display text-sm font-black opacity-60 [@media(hover:hover)]:block"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <AnswerIcon index={i} className="size-12" />
              {showText && (
                <span className="font-display text-lg leading-tight font-extrabold">{o.text}</span>
              )}
              {on && (
                <span className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-white">
                  <Check className="size-5" strokeWidth={4} />
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
      {multi && (
        <button
          type="button"
          disabled={disabled || selected.length === 0}
          onClick={() => onSubmit({ optionIds: selected })}
          className="h-16 cursor-pointer rounded-2xl bg-primary font-display text-xl font-extrabold text-primary-ink shadow-[0_6px_0_0_var(--primary-shadow)] active:translate-y-1 active:shadow-none disabled:opacity-50"
        >
          {t('sendSelection', { count: selected.length })}
        </button>
      )}
    </div>
  );
}

/** Insignia de resultado (✓ / ✗) que aparece con rebote. */
export function ResultBadge({ correct }: { correct: boolean }) {
  return (
    <AnimatePresence>
      <motion.span
        initial={{ scale: 0, rotate: -40 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 12 }}
        className={cn(
          'grid size-28 place-items-center rounded-full text-white shadow-2xl',
          correct ? 'bg-[#12a150]' : 'bg-[#e5484d]',
        )}
      >
        {correct ? (
          <Check className="size-16" strokeWidth={4} />
        ) : (
          <X className="size-16" strokeWidth={4} />
        )}
      </motion.span>
    </AnimatePresence>
  );
}
