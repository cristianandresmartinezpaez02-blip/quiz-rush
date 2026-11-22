'use client';
// Selector de tipo de pregunta: los 14 tipos, con los que llegan en fases posteriores marcados "Pronto".
import { useTranslations } from 'next-intl';
import {
  EDITOR_ENABLED_TYPES,
  QUESTION_TYPE_EMOJI,
  QUESTION_TYPES,
  type QuestionType,
} from '@quiz-rush/shared';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';

export function TypePicker({
  open,
  onClose,
  onPick,
  current,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (type: QuestionType) => void;
  current?: QuestionType;
}) {
  const t = useTranslations('editor');
  const tq = useTranslations('questionTypes');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('questionTypeTitle')}
      className="w-[min(94vw,44rem)]"
    >
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {QUESTION_TYPES.map((type) => {
          const enabled = EDITOR_ENABLED_TYPES.includes(type);
          return (
            <li key={type}>
              <button
                type="button"
                disabled={!enabled}
                onClick={() => onPick(type)}
                aria-current={current === type || undefined}
                className={cn(
                  'relative flex w-full cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 p-4 text-center transition-all',
                  enabled
                    ? 'border-line bg-surface-2 hover:-translate-y-0.5 hover:border-accent active:translate-y-0'
                    : 'cursor-not-allowed border-line/50 opacity-50',
                  current === type && 'border-accent bg-accent/10',
                )}
              >
                <span className="text-3xl" aria-hidden="true">
                  {QUESTION_TYPE_EMOJI[type]}
                </span>
                <span className="text-sm font-bold">{tq(type)}</span>
                {!enabled && (
                  <span className="absolute top-2 right-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-extrabold text-primary-ink uppercase">
                    {t('comingSoon')}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
