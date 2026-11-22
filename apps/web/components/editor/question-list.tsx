'use client';
// Panel izquierdo: lista de preguntas reordenable (ratón, táctil y teclado).
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
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Copy, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  LIMITS,
  QUESTION_TYPE_EMOJI,
  type QuestionDoc,
  type ValidationIssue,
} from '@quiz-rush/shared';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '@/stores/editor-store';
import { cn } from '@/lib/utils';
import { TypePicker } from './type-picker';

export function QuestionList({ issues }: { issues: ValidationIssue[] }) {
  const t = useTranslations('editor');
  const questions = useEditorStore((s) => s.doc.questions);
  const selectedId = useEditorStore((s) => s.selectedId);
  const moveQuestion = useEditorStore((s) => s.moveQuestion);
  const addQuestion = useEditorStore((s) => s.addQuestion);
  const [pickerOpen, setPickerOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const withIssues = new Set(issues.map((i) => i.questionId).filter(Boolean));
  const full = questions.length >= LIMITS.questionsPerQuiz.max;

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = questions.findIndex((q) => q.id === active.id);
    const to = questions.findIndex((q) => q.id === over.id);
    if (from >= 0 && to >= 0) moveQuestion(from, to);
  }

  return (
    <aside
      aria-label={t('questions')}
      className="flex min-h-0 flex-col border-b-2 border-line bg-surface lg:border-r-2 lg:border-b-0"
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <h2 className="text-xs font-extrabold tracking-wider text-muted uppercase">
          {t('questions')} · {questions.length}
        </h2>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
          <ol className="flex gap-2 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto">
            {questions.map((q, i) => (
              <SortableQuestion
                key={q.id}
                question={q}
                index={i}
                selected={q.id === selectedId}
                hasIssues={withIssues.has(q.id)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <div className="hidden border-t-2 border-line p-3 lg:block">
        <Button
          className="w-full"
          onClick={() => setPickerOpen(true)}
          disabled={full}
          title={full ? t('maxQuestions', { max: LIMITS.questionsPerQuiz.max }) : undefined}
        >
          <Plus className="size-5" strokeWidth={3} /> {t('addQuestion')}
        </Button>
      </div>
      {/* En celular el botón vive al final de la fila horizontal */}
      <div className="px-3 pb-3 lg:hidden">
        <Button size="sm" className="w-full" onClick={() => setPickerOpen(true)} disabled={full}>
          <Plus className="size-4" strokeWidth={3} /> {t('addQuestion')}
        </Button>
      </div>
      <TypePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(type) => {
          addQuestion(type, selectedId ?? undefined);
          setPickerOpen(false);
        }}
      />
    </aside>
  );
}

function SortableQuestion({
  question,
  index,
  selected,
  hasIssues,
}: {
  question: QuestionDoc;
  index: number;
  selected: boolean;
  hasIssues: boolean;
}) {
  const t = useTranslations('editor');
  const tq = useTranslations('questionTypes');
  const select = useEditorStore((s) => s.select);
  const duplicate = useEditorStore((s) => s.duplicate);
  const remove = useEditorStore((s) => s.removeQuestion);
  const total = useEditorStore((s) => s.doc.questions.length);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: question.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group relative w-44 shrink-0 rounded-2xl border-2 transition-colors lg:w-auto',
        selected ? 'border-accent bg-accent/10' : 'border-line bg-surface-2 hover:border-accent/50',
        isDragging && 'z-10 shadow-2xl ring-4 ring-[var(--primary)]',
      )}
    >
      <button
        type="button"
        onClick={() => select(question.id)}
        aria-current={selected || undefined}
        className="flex w-full cursor-pointer items-start gap-2 p-2.5 pr-8 text-left"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface font-display text-sm font-extrabold">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 text-[11px] font-bold text-muted">
            <span aria-hidden="true">{QUESTION_TYPE_EMOJI[question.type]}</span> {tq(question.type)}{' '}
            · {question.timeLimit}s
          </span>
          <span className="line-clamp-2 text-sm leading-snug font-semibold">
            {question.prompt || <span className="text-muted italic">{t('promptPlaceholder')}</span>}
          </span>
        </span>
        {hasIssues && (
          <span
            className="absolute top-2 right-2 size-2.5 rounded-full bg-primary ring-2 ring-[var(--surface)]"
            title="!"
          />
        )}
      </button>
      <div className="absolute right-1 bottom-1 flex opacity-100 transition-opacity lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`${t('dragToReorder')} (${index + 1})`}
          className="grid size-7 cursor-grab touch-none place-items-center rounded-lg text-muted hover:text-fg active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => duplicate(question.id)}
          aria-label={t('duplicateQuestion')}
          className="grid size-7 cursor-pointer place-items-center rounded-lg text-muted hover:text-fg"
        >
          <Copy className="size-3.5" />
        </button>
        {total > 1 && (
          <button
            type="button"
            onClick={() => confirm(t('deleteQuestionConfirm')) && remove(question.id)}
            aria-label={t('deleteQuestion')}
            className="grid size-7 cursor-pointer place-items-center rounded-lg text-muted hover:text-danger"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}
