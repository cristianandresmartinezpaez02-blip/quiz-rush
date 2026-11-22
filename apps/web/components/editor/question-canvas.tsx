'use client';
// Lienzo central: vista previa EN VIVO de la pregunta, con el tema visual del quiz,
// tal como la verá el jugador. Se edita directamente sobre ella (WYSIWYG).
import { motion } from 'motion/react';
import { Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { getTheme, LIMITS, OPTION_BASED_TYPES, type ValidationIssue } from '@quiz-rush/shared';
import { useEditorStore, useSelectedQuestion } from '@/stores/editor-store';
import { MediaSlot } from './media';
import { AcceptedAnswersEditor, OptionsEditor } from './options-editor';
import { RevealTilesEditor, TypeConfig } from './type-config';

export function QuestionCanvas({
  readOnly,
  issues,
}: {
  readOnly: boolean;
  issues: ValidationIssue[];
}) {
  const t = useTranslations('editor');
  const ti = useTranslations('issues');
  const question = useSelectedQuestion();
  const themeId = useEditorStore((s) => s.doc.theme);
  const questions = useEditorStore((s) => s.doc.questions);
  const update = useEditorStore((s) => s.updateQuestion);
  const theme = getTheme(themeId);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // Ajusta la altura del enunciado a su contenido
  useEffect(() => {
    const el = promptRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [question?.prompt, question?.id]);

  if (!question) {
    return <p className="p-10 text-center text-muted">{t('noQuestionSelected')}</p>;
  }

  const index = questions.findIndex((q) => q.id === question.id);
  const questionIssues = issues.filter((i) => i.questionId === question.id);

  return (
    <div className="flex flex-col gap-4 p-3 md:p-6">
      <p className="text-center text-xs font-bold tracking-wider text-muted uppercase">
        {t('previewLabel')}
      </p>
      {/* Solo animación de entrada: sin animación de salida no conviven dos preguntas en el DOM,
          así lo que se escribe justo después de cambiar nunca va a la pregunta anterior */}
      <motion.section
        key={question.id}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        aria-label={t('questionOf', { current: index + 1, total: questions.length })}
        className="relative mx-auto flex w-full max-w-4xl flex-col gap-5 overflow-hidden rounded-[1.75rem] p-4 text-white shadow-2xl md:p-8"
        style={{ background: `linear-gradient(140deg, ${theme.from}, ${theme.to})` }}
      >
        <ThemePattern pattern={theme.pattern} />

        <div className="relative flex items-center justify-between text-sm font-bold">
          <span className="rounded-full bg-black/30 px-3 py-1">
            {t('questionOf', { current: index + 1, total: questions.length })}
          </span>
          <span
            className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[#1a1640]"
            style={{ background: theme.accent }}
          >
            <Clock className="size-4" strokeWidth={3} /> {question.timeLimit}s
          </span>
        </div>

        <div className="relative">
          <label htmlFor="q-prompt" className="sr-only">
            {t('promptPlaceholder')}
          </label>
          <textarea
            id="q-prompt"
            ref={promptRef}
            rows={1}
            readOnly={readOnly}
            value={question.prompt}
            maxLength={LIMITS.questionPrompt.max}
            onChange={(e) => update(question.id, (q) => void (q.prompt = e.target.value))}
            placeholder={t('promptPlaceholder')}
            className="w-full resize-none overflow-hidden rounded-2xl bg-white/95 px-4 py-4 text-center font-display text-xl leading-tight font-extrabold text-[#1a1640] shadow-lg outline-none placeholder:text-[#1a1640]/40 focus:ring-4 focus:ring-[var(--primary)] md:text-3xl"
          />
        </div>

        <div className="relative">
          <MediaSlot
            media={question.media}
            readOnly={readOnly}
            onChange={(media) => update(question.id, (q) => void (q.media = media))}
          />
        </div>

        <div className="relative">
          {question.type === 'TYPE_ANSWER' ? (
            <AcceptedAnswersEditor question={question} readOnly={readOnly} />
          ) : OPTION_BASED_TYPES.includes(question.type) ? (
            <>
              <OptionsEditor question={question} readOnly={readOnly} />
              {question.type === 'REVEAL_IMAGE' && (
                <RevealTilesEditor question={question} readOnly={readOnly} />
              )}
            </>
          ) : (
            <TypeConfig question={question} readOnly={readOnly} />
          )}
        </div>
      </motion.section>

      {!readOnly && questionIssues.length > 0 && (
        <ul
          className="mx-auto flex max-w-4xl flex-wrap justify-center gap-2"
          aria-label={t('publish.checklist')}
        >
          {questionIssues.map((issue) => (
            <li key={issue.code} className="rounded-full bg-primary/20 px-3 py-1 text-xs font-bold">
              ⚠️ {ti(issue.code)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Decoración de fondo según el patrón del tema (estrellas, cuadrícula, píxeles…). */
function ThemePattern({ pattern }: { pattern: string }) {
  const styles: Record<string, string> = {
    stars: 'radial-gradient(circle, rgba(255,255,255,.7) 1px, transparent 1.5px) 0 0/38px 38px',
    grid: 'linear-gradient(rgba(255,255,255,.09) 1px, transparent 1px) 0 0/32px 32px, linear-gradient(90deg, rgba(255,255,255,.09) 1px, transparent 1px) 0 0/32px 32px',
    pixels:
      'conic-gradient(rgba(255,255,255,.07) 25%, transparent 0 50%, rgba(255,255,255,.07) 0 75%, transparent 0) 0 0/24px 24px',
    dots: 'radial-gradient(circle, rgba(255,255,255,.35) 3px, transparent 3.5px) 0 0/30px 30px',
    waves:
      'repeating-radial-gradient(circle at 0 100%, rgba(255,255,255,.08) 0 8px, transparent 8px 24px)',
    leaves:
      'radial-gradient(ellipse 5px 2.5px, rgba(198,244,50,.35) 98%, transparent) 0 0/36px 36px, radial-gradient(ellipse 5px 2.5px, rgba(255,255,255,.18) 98%, transparent) 18px 18px/36px 36px',
    embers: 'radial-gradient(circle, rgba(255,180,60,.45) 1.5px, transparent 2px) 0 0/26px 26px',
    snow: 'radial-gradient(circle, rgba(255,255,255,.55) 2px, transparent 2.5px) 0 0/34px 34px',
  };
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 opacity-70"
      style={{ background: styles[pattern] ?? styles.stars }}
    />
  );
}
