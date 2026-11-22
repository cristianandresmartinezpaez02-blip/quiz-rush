'use client';
// Edición de opciones sobre la vista previa: fichas de colores reordenables (arrastrar y soltar),
// marcar la correcta, añadir/quitar opciones; y editor de respuestas escritas aceptadas.
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, GripVertical, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createOption, LIMITS, type OptionDoc, type QuestionDoc } from '@quiz-rush/shared';
import { AnswerIcon, answerStyle } from '@/components/ui/answer-shape';
import { useEditorStore } from '@/stores/editor-store';
import { SuggestDistractors } from './ai-assist';
import { cn, haptic } from '@/lib/utils';

export function OptionsEditor({
  question,
  readOnly,
}: {
  question: QuestionDoc;
  readOnly: boolean;
}) {
  const t = useTranslations('editor');
  const update = useEditorStore((s) => s.updateQuestion);
  const language = useEditorStore((s) => s.doc.language);
  const isTrueFalse = question.type === 'TRUE_FALSE';
  const isPoll = question.type === 'POLL';
  // Ordenar: el orden de la lista ES la respuesta correcta (al jugador le llega desordenada)
  const isOrder = question.type === 'ORDER';
  const limits = isOrder ? LIMITS.orderItems : LIMITS.options;
  const canEditList = !isTrueFalse && !readOnly;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    update(question.id, (q) => {
      const from = q.options.findIndex((o) => o.id === active.id);
      const to = q.options.findIndex((o) => o.id === over.id);
      q.options = arrayMove(q.options, from, to);
    });
  }

  function toggleCorrect(optionId: string) {
    haptic(10);
    update(question.id, (q) => {
      const multi = !!q.config.multiSelect;
      for (const o of q.options) {
        if (o.id === optionId) o.isCorrect = multi ? !o.isCorrect : true;
        else if (!multi) o.isCorrect = false;
      }
    });
  }

  return (
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={question.options.map((o) => o.id)} strategy={rectSortingStrategy}>
          <ul
            className={cn(
              'grid gap-3',
              isTrueFalse ? 'grid-cols-2' : isOrder ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2',
            )}
          >
            {question.options.map((option, i) => (
              <OptionTile
                key={option.id}
                option={option}
                index={i}
                readOnly={readOnly}
                fixedText={isTrueFalse}
                sortable={canEditList}
                showCorrect={!isPoll && !isOrder}
                position={isOrder ? i + 1 : undefined}
                removable={canEditList && question.options.length > limits.min}
                onText={(text) =>
                  update(question.id, (q) => {
                    const o = q.options.find((x) => x.id === option.id);
                    if (o) o.text = text;
                  })
                }
                onToggleCorrect={() => toggleCorrect(option.id)}
                onRemove={() =>
                  update(
                    question.id,
                    (q) => void (q.options = q.options.filter((o) => o.id !== option.id)),
                  )
                }
                placeholder={t('optionPlaceholder', { n: i + 1 })}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {isOrder && <p className="mt-3 text-center text-xs text-white/80">{t('types.orderHelp')}</p>}
      {!readOnly && question.type === 'MULTIPLE_CHOICE' && (
        <div className="mt-3 flex justify-center">
          <SuggestDistractors question={question} language={language} />
        </div>
      )}
      {canEditList && question.options.length < limits.max && (
        <button
          type="button"
          onClick={() => update(question.id, (q) => void q.options.push(createOption()))}
          className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/35 py-3 text-sm font-bold text-white/85 transition-colors hover:border-white hover:bg-white/10"
        >
          <Plus className="size-4" strokeWidth={3} /> {t('addOption')}
        </button>
      )}
    </div>
  );
}

function OptionTile({
  option,
  index,
  readOnly,
  fixedText,
  sortable,
  showCorrect,
  position,
  removable,
  onText,
  onToggleCorrect,
  onRemove,
  placeholder,
}: {
  option: OptionDoc;
  index: number;
  readOnly: boolean;
  fixedText: boolean;
  sortable: boolean;
  showCorrect: boolean;
  /** Ordenar: posición correcta del elemento */
  position?: number;
  removable: boolean;
  onText: (text: string) => void;
  onToggleCorrect: () => void;
  onRemove: () => void;
  placeholder: string;
}) {
  const t = useTranslations('editor');
  const tc = useTranslations('common');
  const style = answerStyle(index);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: option.id,
    disabled: !sortable,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'relative flex min-h-20 min-w-0 items-center gap-2 rounded-2xl p-2 pr-3 text-[#1a1640] shadow-[0_5px_0_0_rgba(0,0,0,.25)] transition-[box-shadow,transform]',
        style.bg,
        isDragging && 'z-10 scale-105 shadow-2xl',
        showCorrect && option.isCorrect && 'ring-4 ring-white',
      )}
    >
      {sortable && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t('dragToReorder')}
          className="grid h-full w-6 shrink-0 cursor-grab touch-none place-items-center rounded-lg opacity-60 hover:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
      )}
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/35 font-display text-xl font-black">
        {position ?? <AnswerIcon index={index} className="size-5" />}
      </span>
      {readOnly || fixedText ? (
        <span className="flex-1 font-display text-lg font-extrabold break-words">
          {option.text || <span className="opacity-50">{placeholder}</span>}
        </span>
      ) : (
        <input
          value={option.text}
          onChange={(e) => onText(e.target.value)}
          placeholder={placeholder}
          maxLength={LIMITS.optionText.max}
          aria-label={placeholder}
          className="min-w-0 flex-1 rounded-xl bg-white/0 px-2 py-2 font-display text-lg font-extrabold outline-none placeholder:text-[#1a1640]/45 focus:bg-white/40"
        />
      )}
      {showCorrect && !readOnly && (
        <button
          type="button"
          onClick={onToggleCorrect}
          aria-pressed={option.isCorrect}
          aria-label={t('markCorrect')}
          title={t('markCorrect')}
          className={cn(
            'grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border-[3px] transition-all active:scale-90',
            option.isCorrect
              ? 'border-white bg-[#12a150] text-white'
              : 'border-[#1a1640]/40 bg-white/40 text-transparent hover:border-[#1a1640]',
          )}
        >
          <Check className="size-5" strokeWidth={4} />
        </button>
      )}
      {showCorrect && readOnly && option.isCorrect && (
        <span
          className="grid size-9 place-items-center rounded-full bg-[#12a150] text-white"
          aria-label={t('correct')}
        >
          <Check className="size-5" strokeWidth={4} />
        </span>
      )}
      {removable && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={tc('remove')}
          className="absolute -top-2 -right-2 grid size-6 cursor-pointer place-items-center rounded-full bg-[#1a1640] text-white shadow"
        >
          <X className="size-3.5" strokeWidth={3} />
        </button>
      )}
    </li>
  );
}

/** Respuesta escrita: vista de la caja de texto del jugador + variantes aceptadas. */
export function AcceptedAnswersEditor({
  question,
  readOnly,
}: {
  question: QuestionDoc;
  readOnly: boolean;
}) {
  const t = useTranslations('editor');
  const tc = useTranslations('common');
  const update = useEditorStore((s) => s.updateQuestion);
  const accepted = question.config.accepted ?? [''];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl bg-white/95 px-4 py-4 text-center text-lg font-bold text-[#1a1640]/50 shadow-lg">
        ⌨️ {t('typeAnswerPreview')}
      </div>
      {!readOnly && (
        <div className="rounded-2xl bg-black/25 p-4">
          <p className="mb-1 text-sm font-extrabold">{t('acceptedAnswers')}</p>
          <p className="mb-3 text-xs text-white/75">{t('acceptedHelp')}</p>
          <ul className="flex flex-col gap-2">
            {accepted.map((value, i) => (
              <li key={i} className="flex gap-2">
                <input
                  value={value}
                  onChange={(e) =>
                    update(question.id, (q) => {
                      const list = [...(q.config.accepted ?? [''])];
                      list[i] = e.target.value;
                      q.config.accepted = list;
                    })
                  }
                  placeholder={t('variantPlaceholder')}
                  aria-label={`${t('variantPlaceholder')} ${i + 1}`}
                  maxLength={LIMITS.optionText.max}
                  className="h-11 min-w-0 flex-1 rounded-xl bg-white px-3 font-bold text-[#1a1640] outline-none focus:ring-4 focus:ring-[var(--primary)]"
                />
                {accepted.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      update(
                        question.id,
                        (q) =>
                          void (q.config.accepted = (q.config.accepted ?? []).filter(
                            (_, j) => j !== i,
                          )),
                      )
                    }
                    aria-label={tc('remove')}
                    className="grid size-11 cursor-pointer place-items-center rounded-xl bg-white/15 hover:bg-white/25"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {accepted.length < LIMITS.acceptedAnswers.max && (
            <button
              type="button"
              onClick={() =>
                update(
                  question.id,
                  (q) => void (q.config.accepted = [...(q.config.accepted ?? []), '']),
                )
              }
              className="mt-3 flex cursor-pointer items-center gap-1 text-sm font-bold text-white/85 hover:text-white"
            >
              <Plus className="size-4" strokeWidth={3} /> {t('addVariant')}
            </button>
          )}
        </div>
      )}
      {readOnly && accepted.filter(Boolean).length > 0 && (
        <p className="text-center text-sm font-bold">✅ {accepted.filter(Boolean).join(' · ')}</p>
      )}
    </div>
  );
}
