'use client';
// Indicador "Guardando… / ✓ Guardado" con animación entre estados (anunciado al lector de pantalla).
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Check, CloudOff, Loader2, PenLine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEditorStore } from '@/stores/editor-store';
import { cn } from '@/lib/utils';

export function SaveIndicator() {
  const t = useTranslations('editor.save');
  const state = useEditorStore((s) => s.saveState);

  const config = {
    saved: { icon: Check, text: t('saved'), cls: 'text-success' },
    dirty: { icon: PenLine, text: t('dirty'), cls: 'text-muted' },
    saving: { icon: Loader2, text: t('saving'), cls: 'text-muted' },
    error: { icon: AlertTriangle, text: t('error'), cls: 'text-danger' },
    offline: { icon: CloudOff, text: t('offline'), cls: 'text-accent' },
    conflict: { icon: AlertTriangle, text: t('conflict'), cls: 'text-danger' },
  }[state];
  const Icon = config.icon;

  return (
    <div role="status" aria-live="polite" className="flex h-6 items-center text-sm font-bold">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={state}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
          className={cn('flex items-center gap-1.5 whitespace-nowrap', config.cls)}
        >
          <Icon className={cn('size-4', state === 'saving' && 'animate-spin')} strokeWidth={3} />
          {config.text}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
