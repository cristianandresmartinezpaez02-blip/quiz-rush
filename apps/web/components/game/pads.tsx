'use client';
// Botoneras del jugador para los tipos de pregunta de la Fase 4: ordenar, emparejar, deslizador,
// pin en imagen, completar espacios, nube de palabras, respuesta abierta, votación y adivinar dibujo.
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
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'motion/react';
import { ChevronDown, ChevronUp, GripVertical, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { AnswerPayload, PublicQuestion, Stroke, VoteCandidate } from '@quiz-rush/shared';
import { answerStyle } from '@/components/ui/answer-shape';
import { cn } from '@/lib/utils';
import { StrokeCanvas } from './draw-canvas';

type Submit = (answer: Omit<AnswerPayload, 'qIndex'>) => void;
type PadProps = { question: PublicQuestion; disabled: boolean; onSubmit: Submit };

const sendBtn =
  'flex h-16 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-primary font-display text-xl font-extrabold text-primary-ink shadow-[0_6px_0_0_var(--primary-shadow)] active:translate-y-1 active:shadow-none disabled:opacity-50';
const field =
  'h-14 min-w-0 rounded-2xl bg-white px-4 font-display text-xl font-extrabold text-[#1a1640] outline-none focus:ring-4 focus:ring-[var(--primary)]';

/** Botonera para los tipos nuevos (null si el tipo usa la botonera clásica). */
export function TypePad({ question, disabled, onSubmit }: PadProps) {
  const extra = question.extra;
  if (!extra) return null;
  switch (extra.kind) {
    case 'order':
      return <OrderPad items={extra.items} disabled={disabled} onSubmit={onSubmit} />;
    case 'match':
      return (
        <MatchPad left={extra.left} right={extra.right} disabled={disabled} onSubmit={onSubmit} />
      );
    case 'slider':
      return <SliderPad {...extra} disabled={disabled} onSubmit={onSubmit} />;
    case 'pin':
      return <PinPad imageUrl={extra.imageUrl} disabled={disabled} onSubmit={onSubmit} />;
    case 'blanks':
      return <BlanksPad parts={extra.parts} disabled={disabled} onSubmit={onSubmit} />;
    case 'cloud':
      return <CloudPad maxWords={extra.maxWords} disabled={disabled} onSubmit={onSubmit} />;
    case 'vote':
      return <OpenTextPad disabled={disabled} onSubmit={onSubmit} />;
    default:
      return null;
  }
}

// ───────────────────────── Ordenar ─────────────────────────

function OrderPad({
  items: initialItems,
  disabled,
  onSubmit,
}: {
  items: { id: string; text: string }[];
  disabled: boolean;
  onSubmit: Submit;
}) {
  const t = useTranslations('game.pads');
  const [items, setItems] = useState(initialItems);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 80, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    setItems((list) => arrayMove(list, from, to));
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    move(
      items.findIndex((i) => i.id === active.id),
      items.findIndex((i) => i.id === over.id),
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-sm font-bold opacity-90">{t('orderHelp')}</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ol className="flex flex-col gap-2">
            {items.map((item, i) => (
              <OrderItem
                key={item.id}
                id={item.id}
                text={item.text}
                index={i}
                last={i === items.length - 1}
                disabled={disabled}
                onMove={(d) => move(i, i + d)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <button
        type="button"
        disabled={disabled}
        className={sendBtn}
        onClick={() => onSubmit({ order: items.map((i) => i.id) })}
      >
        <Send className="size-6" /> {t('send')}
      </button>
    </div>
  );
}

function OrderItem({
  id,
  text,
  index,
  last,
  disabled,
  onMove,
}: {
  id: string;
  text: string;
  index: number;
  last: boolean;
  disabled: boolean;
  onMove: (delta: number) => void;
}) {
  const t = useTranslations('game.pads');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-2 rounded-2xl p-2 text-[#1a1640] shadow-[0_4px_0_0_rgba(0,0,0,.25)]',
        answerStyle(index).bg,
        isDragging && 'z-10 scale-105 shadow-2xl',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t('drag', { text })}
        className="grid h-12 w-8 cursor-grab touch-none place-items-center"
      >
        <GripVertical className="size-5" />
      </button>
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/45 font-display text-lg font-black">
        {index + 1}
      </span>
      <span className="flex-1 font-display text-lg leading-tight font-extrabold">{text}</span>
      <span className="flex flex-col">
        <button
          type="button"
          disabled={disabled || index === 0}
          onClick={() => onMove(-1)}
          aria-label={t('moveUp', { text })}
          className="cursor-pointer rounded-lg p-0.5 disabled:opacity-25"
        >
          <ChevronUp className="size-5" strokeWidth={3} />
        </button>
        <button
          type="button"
          disabled={disabled || last}
          onClick={() => onMove(1)}
          aria-label={t('moveDown', { text })}
          className="cursor-pointer rounded-lg p-0.5 disabled:opacity-25"
        >
          <ChevronDown className="size-5" strokeWidth={3} />
        </button>
      </span>
    </li>
  );
}

// ───────────────────────── Emparejar ─────────────────────────

/** Toca un elemento de la izquierda y luego su pareja de la derecha (cada pareja con su color). */
function MatchPad({
  left,
  right,
  disabled,
  onSubmit,
}: {
  left: { id: string; text: string }[];
  right: { id: string; text: string }[];
  disabled: boolean;
  onSubmit: Submit;
}) {
  const t = useTranslations('game.pads');
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string | null>(left[0]?.id ?? null);
  const colorOf = (leftId: string) => answerStyle(left.findIndex((l) => l.id === leftId)).bg;
  const owner = (rightId: string) => Object.entries(pairs).find(([, r]) => r === rightId)?.[0];

  function pick(rightId: string) {
    if (!active) return;
    const next = Object.fromEntries(Object.entries(pairs).filter(([, r]) => r !== rightId));
    next[active] = rightId;
    setPairs(next);
    // Pasa solo al siguiente elemento sin pareja
    setActive(left.find((l) => !next[l.id])?.id ?? null);
  }

  const complete = left.every((l) => pairs[l.id]);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-sm font-bold opacity-90">{t('matchHelp')}</p>
      <div className="grid grid-cols-2 gap-3">
        <ul className="flex flex-col gap-2" aria-label={t('matchLeft')}>
          {left.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                disabled={disabled}
                aria-pressed={active === l.id}
                onClick={() => setActive(l.id)}
                className={cn(
                  'min-h-14 w-full cursor-pointer rounded-2xl px-3 py-2 font-display text-base font-extrabold text-[#1a1640] shadow-[0_4px_0_0_rgba(0,0,0,.25)]',
                  pairs[l.id] ? colorOf(l.id) : 'bg-white',
                  active === l.id && 'ring-4 ring-white outline-2 outline-[#1a1640]',
                )}
              >
                {l.text}
              </button>
            </li>
          ))}
        </ul>
        <ul className="flex flex-col gap-2" aria-label={t('matchRight')}>
          {right.map((r) => {
            const o = owner(r.id);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  disabled={disabled || !active}
                  onClick={() => pick(r.id)}
                  aria-label={o ? `${r.text} ⟷ ${left.find((l) => l.id === o)?.text}` : r.text}
                  className={cn(
                    'min-h-14 w-full cursor-pointer rounded-2xl border-4 border-dashed border-white/60 px-3 py-2 font-display text-base font-extrabold',
                    o ? cn(colorOf(o), 'border-solid border-white text-[#1a1640]') : 'bg-black/20',
                  )}
                >
                  {r.text}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <button
        type="button"
        disabled={disabled || !complete}
        className={sendBtn}
        onClick={() => onSubmit({ pairs })}
      >
        <Send className="size-6" /> {t('send')}
      </button>
    </div>
  );
}

// ───────────────────────── Deslizador ─────────────────────────

function SliderPad({
  min,
  max,
  step,
  unit,
  disabled,
  onSubmit,
}: {
  min: number;
  max: number;
  step: number;
  unit?: string;
  disabled: boolean;
  onSubmit: Submit;
}) {
  const t = useTranslations('game.pads');
  const [value, setValue] = useState(() => {
    const mid = min + (max - min) / 2;
    return Math.round((mid - min) / step) * step + min;
  });
  const decimals = (String(step).split('.')[1] ?? '').length;
  return (
    <div className="flex flex-col gap-6 pt-4">
      <p className="text-center font-display text-6xl font-black tabular-nums" aria-live="polite">
        {value.toFixed(decimals)}
        {unit && <span className="ml-2 text-3xl opacity-80">{unit}</span>}
      </p>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(Number(e.target.value))}
        aria-label={t('sliderLabel')}
        className="h-10 w-full cursor-pointer accent-[var(--primary)]"
      />
      <div className="-mt-4 flex justify-between text-sm font-bold opacity-80">
        <span>{min}</span>
        <span>{max}</span>
      </div>
      <button
        type="button"
        disabled={disabled}
        className={sendBtn}
        onClick={() => onSubmit({ value })}
      >
        <Send className="size-6" /> {t('send')}
      </button>
    </div>
  );
}

// ───────────────────────── Pin en imagen ─────────────────────────

function PinPad({
  imageUrl,
  disabled,
  onSubmit,
}: {
  imageUrl: string;
  disabled: boolean;
  onSubmit: Submit;
}) {
  const t = useTranslations('game.pads');
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const place = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const r = e.currentTarget.getBoundingClientRect();
    setPoint({
      x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)),
    });
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-sm font-bold opacity-90">{t('pinHelp')}</p>
      <div
        onPointerDown={place}
        role="button"
        tabIndex={0}
        aria-label={t('pinHelp')}
        className="relative cursor-crosshair touch-none overflow-hidden rounded-2xl bg-black/30 shadow-xl"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- imagen del autor del quiz */}
        <img src={imageUrl} alt="" draggable={false} className="block w-full select-none" />
        {point && (
          <motion.span
            key={`${point.x}-${point.y}`}
            initial={{ y: -20, scale: 0.5 }}
            animate={{ y: 0, scale: 1 }}
            aria-hidden="true"
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full text-5xl drop-shadow-lg"
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
          >
            📍
          </motion.span>
        )}
      </div>
      <button
        type="button"
        disabled={disabled || !point}
        className={sendBtn}
        onClick={() => point && onSubmit({ point })}
      >
        <Send className="size-6" /> {t('send')}
      </button>
    </div>
  );
}

// ───────────────────────── Completar espacios ─────────────────────────

function BlanksPad({
  parts,
  disabled,
  onSubmit,
}: {
  parts: string[];
  disabled: boolean;
  onSubmit: Submit;
}) {
  const t = useTranslations('game.pads');
  const holes = Math.max(parts.length - 1, 0);
  const [values, setValues] = useState<string[]>(() => Array.from({ length: holes }, () => ''));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ blanks: values.map((v) => v.trim()) });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="rounded-2xl bg-white/95 px-4 py-5 text-center font-display text-xl leading-loose font-extrabold text-[#1a1640]">
        {parts.map((p, i) => (
          <span key={i}>
            {p}
            {i < holes && (
              <input
                value={values[i] ?? ''}
                disabled={disabled}
                maxLength={80}
                autoComplete="off"
                autoCapitalize="off"
                autoFocus={i === 0}
                aria-label={t('blankN', { n: i + 1 })}
                onChange={(e) => setValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
                className="mx-1 inline-block w-32 rounded-lg border-b-4 border-[var(--primary)] bg-[#1a1640]/10 px-2 text-center outline-none focus:bg-[#ffe14d]/40"
              />
            )}
          </span>
        ))}
      </p>
      <button
        type="submit"
        disabled={disabled || values.some((v) => !v.trim())}
        className={sendBtn}
      >
        <Send className="size-6" /> {t('send')}
      </button>
    </form>
  );
}

// ───────────────────────── Nube de palabras ─────────────────────────

function CloudPad({
  maxWords,
  disabled,
  onSubmit,
}: {
  maxWords: number;
  disabled: boolean;
  onSubmit: Submit;
}) {
  const t = useTranslations('game.pads');
  const [words, setWords] = useState<string[]>(() => Array.from({ length: maxWords }, () => ''));
  const filled = words.map((w) => w.trim()).filter(Boolean);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (filled.length) onSubmit({ words: filled });
      }}
    >
      <p className="text-center text-sm font-bold opacity-90">
        {t('cloudHelp', { count: maxWords })}
      </p>
      {words.map((w, i) => (
        <input
          key={i}
          value={w}
          disabled={disabled}
          maxLength={24}
          autoComplete="off"
          autoFocus={i === 0}
          aria-label={t('wordN', { n: i + 1 })}
          placeholder={t('wordN', { n: i + 1 })}
          onChange={(e) =>
            setWords((list) =>
              list.map((x, j) => (j === i ? e.target.value.replace(/\s+/g, ' ') : x)),
            )
          }
          className={field}
        />
      ))}
      <button type="submit" disabled={disabled || filled.length === 0} className={sendBtn}>
        <Send className="size-6" /> {t('send')}
      </button>
    </form>
  );
}

// ───────────────────────── Pregunta abierta ─────────────────────────

function OpenTextPad({ disabled, onSubmit }: { disabled: boolean; onSubmit: Submit }) {
  const t = useTranslations('game.pads');
  const [text, setText] = useState('');
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSubmit({ text: text.trim() });
      }}
    >
      <label htmlFor="open-answer" className="text-center text-sm font-bold opacity-90">
        {t('openHelp')}
      </label>
      <textarea
        id="open-answer"
        value={text}
        disabled={disabled}
        maxLength={120}
        rows={3}
        autoFocus
        onChange={(e) => setText(e.target.value)}
        className="resize-none rounded-2xl bg-white px-4 py-3 font-display text-xl font-extrabold text-[#1a1640] outline-none focus:ring-4 focus:ring-[var(--primary)]"
      />
      <p className="-mt-2 text-right text-xs font-bold opacity-75">{text.length}/120</p>
      <button type="submit" disabled={disabled || !text.trim()} className={sendBtn}>
        <Send className="size-6" /> {t('send')}
      </button>
    </form>
  );
}

// ───────────────────────── Votación ─────────────────────────

export function VotePad({
  candidates,
  ownText,
  voted,
  onVote,
}: {
  candidates: VoteCandidate[];
  ownText: string | null;
  voted: boolean;
  onVote: (id: string) => void;
}) {
  const t = useTranslations('game.pads');
  if (voted) {
    return (
      <div className="m-auto flex flex-col items-center gap-3 text-center">
        <span className="text-7xl" aria-hidden="true">
          🗳️
        </span>
        <h1 className="font-display text-3xl font-extrabold">{t('voted')}</h1>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-center font-display text-2xl font-extrabold">🗳️ {t('voteTitle')}</h1>
      <ul className="flex flex-col gap-2">
        {candidates.map((c, i) => {
          const own = !!ownText && c.text.trim() === ownText.trim();
          return (
            <li key={c.id}>
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                disabled={own}
                onClick={() => onVote(c.id)}
                className={cn(
                  'w-full cursor-pointer rounded-2xl px-4 py-3 text-left font-display text-lg font-extrabold text-[#1a1640] shadow-[0_4px_0_0_rgba(0,0,0,.25)] disabled:cursor-not-allowed disabled:opacity-50',
                  answerStyle(i).bg,
                )}
              >
                {c.text}
                {own && <span className="ml-2 text-xs font-bold">({t('yours')})</span>}
              </motion.button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ───────────────────────── Adivinar el dibujo ─────────────────────────

export function GuessPad({
  strokes,
  wordLength,
  drawer,
  disabled,
  onGuess,
}: {
  strokes: Stroke[];
  wordLength: number;
  drawer: string | null;
  disabled: boolean;
  /** Devuelve true si acertó */
  onGuess: (text: string) => Promise<boolean>;
}) {
  const t = useTranslations('game.pads');
  const [text, setText] = useState('');
  const [wrong, setWrong] = useState(0);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      {drawer && (
        <p className="text-center text-sm font-bold opacity-90">{t('drawing', { nick: drawer })}</p>
      )}
      <StrokeCanvas strokes={strokes} />
      <p
        className="text-center font-display text-2xl font-black tracking-[0.3em]"
        aria-label={t('letters', { count: wordLength })}
      >
        {'_ '.repeat(wordLength).trim()}
      </p>
      <motion.form
        key={wrong}
        animate={wrong ? { x: [0, -10, 10, -6, 6, 0] } : undefined}
        transition={{ duration: 0.3 }}
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const guess = text.trim();
          if (!guess || busy) return;
          setBusy(true);
          const ok = await onGuess(guess);
          setBusy(false);
          if (!ok) {
            setWrong((n) => n + 1);
            setText('');
          }
        }}
      >
        <input
          value={text}
          disabled={disabled}
          maxLength={40}
          autoComplete="off"
          autoCapitalize="off"
          aria-label={t('guess')}
          placeholder={t('guess')}
          onChange={(e) => setText(e.target.value)}
          className={cn(field, 'flex-1')}
        />
        <button
          type="submit"
          disabled={disabled || busy || !text.trim()}
          aria-label={t('send')}
          className="grid size-14 cursor-pointer place-items-center rounded-2xl bg-primary text-primary-ink disabled:opacity-50"
        >
          <Send className="size-6" />
        </button>
      </motion.form>
      {wrong > 0 && (
        <p role="status" className="text-center text-sm font-bold">
          {t('tryAgain')}
        </p>
      )}
    </div>
  );
}
