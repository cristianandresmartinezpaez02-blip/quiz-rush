'use client';
// Configuración específica de los tipos de pregunta de la Fase 4, editada sobre la vista previa:
// emparejar, deslizador, pin en imagen, completar espacios, imagen revelada, nube de palabras,
// pregunta abierta con votación y dibujo rápido.
import { ImagePlus, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { toast } from 'sonner';
import { blankParts, LIMITS, newId, type QuestionDoc } from '@quiz-rush/shared';
import { useEditorStore } from '@/stores/editor-store';
import { cn } from '@/lib/utils';
import { uploadMedia } from './media';

type Props = { question: QuestionDoc; readOnly: boolean };

const panel = 'rounded-2xl bg-black/25 p-4';
const input =
  'h-11 min-w-0 flex-1 rounded-xl bg-white px-3 font-bold text-[#1a1640] outline-none focus:ring-4 focus:ring-[var(--primary)] disabled:opacity-80';
const removeBtn =
  'grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl bg-white/15 hover:bg-white/25';
const addBtn =
  'mt-3 flex cursor-pointer items-center gap-1 text-sm font-bold text-white/85 hover:text-white';

/** Elige el editor adecuado para el tipo (null si el tipo no tiene configuración propia). */
export function TypeConfig({ question, readOnly }: Props) {
  switch (question.type) {
    case 'MATCH':
      return <MatchEditor question={question} readOnly={readOnly} />;
    case 'SLIDER':
      return <SliderEditor question={question} readOnly={readOnly} />;
    case 'PIN':
      return <PinEditor question={question} readOnly={readOnly} />;
    case 'FILL_BLANK':
      return <BlanksEditor question={question} readOnly={readOnly} />;
    case 'WORD_CLOUD':
      return <CloudEditor question={question} readOnly={readOnly} />;
    case 'OPEN_VOTE':
      return <OpenVotePreview />;
    case 'DRAW':
      return <DrawEditor question={question} readOnly={readOnly} />;
    default:
      return null;
  }
}

// ───────────────────────── Emparejar ─────────────────────────

function MatchEditor({ question, readOnly }: Props) {
  const t = useTranslations('editor.types');
  const tc = useTranslations('common');
  const update = useEditorStore((s) => s.updateQuestion);
  const pairs = question.config.pairs ?? [];
  const setPair = (id: string, side: 'left' | 'right', value: string) =>
    update(question.id, (q) => {
      const p = q.config.pairs?.find((x) => x.id === id);
      if (p) p[side] = value;
    });

  return (
    <div className={panel}>
      <p className="mb-3 text-sm font-extrabold">🔗 {t('matchHelp')}</p>
      <ul className="flex flex-col gap-2">
        {pairs.map((p, i) => (
          <li key={p.id} className="flex items-center gap-2">
            <input
              value={p.left}
              disabled={readOnly}
              maxLength={80}
              onChange={(e) => setPair(p.id, 'left', e.target.value)}
              placeholder={t('matchLeft', { n: i + 1 })}
              aria-label={t('matchLeft', { n: i + 1 })}
              className={input}
            />
            <span aria-hidden="true" className="text-xl font-black">
              ⟷
            </span>
            <input
              value={p.right}
              disabled={readOnly}
              maxLength={80}
              onChange={(e) => setPair(p.id, 'right', e.target.value)}
              placeholder={t('matchRight', { n: i + 1 })}
              aria-label={t('matchRight', { n: i + 1 })}
              className={input}
            />
            {!readOnly && pairs.length > LIMITS.matchPairs.min && (
              <button
                type="button"
                aria-label={tc('remove')}
                className={removeBtn}
                onClick={() =>
                  update(question.id, (q) => {
                    q.config.pairs = (q.config.pairs ?? []).filter((x) => x.id !== p.id);
                  })
                }
              >
                <X className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && pairs.length < LIMITS.matchPairs.max && (
        <button
          type="button"
          className={addBtn}
          onClick={() =>
            update(question.id, (q) => {
              q.config.pairs = [...(q.config.pairs ?? []), { id: newId(), left: '', right: '' }];
            })
          }
        >
          <Plus className="size-4" strokeWidth={3} /> {t('addPair')}
        </button>
      )}
      <p className="mt-3 text-xs text-white/75">{t('matchShuffled')}</p>
    </div>
  );
}

// ───────────────────────── Deslizador ─────────────────────────

function SliderEditor({ question, readOnly }: Props) {
  const t = useTranslations('editor.types');
  const update = useEditorStore((s) => s.updateQuestion);
  const s = question.config.slider ?? { min: 0, max: 100, step: 1, correct: 50, tolerance: 10 };
  const set = (key: 'min' | 'max' | 'step' | 'correct' | 'tolerance', raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    update(question.id, (q) => {
      q.config.slider = {
        ...s,
        ...q.config.slider,
        [key]: key === 'step' ? Math.max(value, 0.0001) : value,
      };
    });
  };
  const range = Math.max(s.max - s.min, 1);
  const pct = (v: number) => `${Math.min(100, Math.max(0, ((v - s.min) / range) * 100))}%`;
  const fields = [
    ['min', s.min],
    ['max', s.max],
    ['step', s.step],
    ['correct', s.correct],
    ['tolerance', s.tolerance],
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      {/* Vista previa: la zona verde es la que da puntos */}
      <div className="rounded-2xl bg-white/95 px-5 pt-8 pb-5 text-[#1a1640] shadow-lg">
        <div className="relative h-4 rounded-full bg-[#1a1640]/15">
          <div
            className="absolute inset-y-0 rounded-full bg-[#12a150]/45"
            style={{
              left: pct(s.correct - s.tolerance),
              right: `calc(100% - ${pct(s.correct + s.tolerance)})`,
            }}
          />
          <div
            className="absolute top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-white bg-[#12a150] shadow"
            style={{ left: pct(s.correct) }}
          />
          <span
            className="absolute -top-8 -translate-x-1/2 rounded-full bg-[#12a150] px-2 py-0.5 text-xs font-black text-white"
            style={{ left: pct(s.correct) }}
          >
            {s.correct}
            {s.unit ? ` ${s.unit}` : ''}
          </span>
        </div>
        <div className="mt-3 flex justify-between text-sm font-bold opacity-70">
          <span>{s.min}</span>
          <span>{s.max}</span>
        </div>
      </div>
      {!readOnly && (
        <div className={cn(panel, 'grid grid-cols-2 gap-3 sm:grid-cols-3')}>
          {fields.map(([key, value]) => (
            <label key={key} className="flex flex-col gap-1 text-xs font-extrabold">
              {t(`slider.${key}`)}
              <input
                type="number"
                value={value}
                step="any"
                onChange={(e) => set(key, e.target.value)}
                className={cn(input, 'w-full flex-none')}
              />
            </label>
          ))}
          <label className="flex flex-col gap-1 text-xs font-extrabold">
            {t('slider.unit')}
            <input
              value={s.unit ?? ''}
              maxLength={12}
              placeholder="km, °C, %"
              onChange={(e) =>
                update(question.id, (q) => {
                  q.config.slider = { ...s, ...q.config.slider, unit: e.target.value || undefined };
                })
              }
              className={cn(input, 'w-full flex-none')}
            />
          </label>
          <p className="col-span-full text-xs text-white/75">{t('slider.help')}</p>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Pin en imagen ─────────────────────────

function PinEditor({ question, readOnly }: Props) {
  const t = useTranslations('editor.types');
  const te = useTranslations('editor');
  const update = useEditorStore((s) => s.updateQuestion);
  const pin = question.config.pin;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    setBusy(true);
    try {
      const media = await uploadMedia(file);
      if (media.kind !== 'image' && media.kind !== 'gif') throw new Error('kind');
      update(question.id, (q) => {
        q.config.pin = { x: 50, y: 50, radius: 10, ...q.config.pin, imageUrl: media.url };
      });
    } catch {
      toast.error(te('uploadError'));
    } finally {
      setBusy(false);
    }
  }

  function place(e: ReactPointerEvent<HTMLDivElement>) {
    if (readOnly || !pin) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * 1000) / 10;
    const y = Math.round(((e.clientY - r.top) / r.height) * 1000) / 10;
    update(question.id, (q) => {
      if (q.config.pin) Object.assign(q.config.pin, { x, y });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {pin ? (
        <div
          role={readOnly ? undefined : 'button'}
          tabIndex={readOnly ? undefined : 0}
          aria-label={t('pinPlace')}
          onPointerDown={place}
          className={cn(
            'relative overflow-hidden rounded-2xl bg-black/30',
            !readOnly && 'cursor-crosshair',
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen subida por el autor */}
          <img src={pin.imageUrl} alt="" className="block w-full select-none" draggable={false} />
          {/* Zona correcta: el radio se mide en % del ancho y del alto, igual que al corregir */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-[#12a150]/40 shadow-[0_0_0_3px_rgba(0,0,0,.3)]"
            style={{
              left: `${pin.x}%`,
              top: `${pin.y}%`,
              width: `${pin.radius * 2}%`,
              height: `${pin.radius * 2}%`,
            }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full text-4xl drop-shadow"
            style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
          >
            📍
          </span>
        </div>
      ) : (
        <button
          type="button"
          disabled={readOnly || busy}
          onClick={() => fileRef.current?.click()}
          className="flex aspect-video w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/40 bg-black/20 font-bold hover:bg-black/30"
        >
          <ImagePlus className="size-8" />
          {busy ? te('uploading') : t('pinUpload')}
        </button>
      )}
      {!readOnly && pin && (
        <div className={cn(panel, 'flex flex-wrap items-center gap-4')}>
          <label className="flex flex-1 items-center gap-3 text-sm font-extrabold">
            {t('pinRadius')}
            <input
              type="range"
              min={2}
              max={30}
              value={pin.radius}
              onChange={(e) =>
                update(question.id, (q) => {
                  if (q.config.pin) q.config.pin.radius = Number(e.target.value);
                })
              }
              className="flex-1 accent-[var(--primary)]"
            />
          </label>
          <button
            type="button"
            className="text-sm font-bold underline"
            onClick={() => fileRef.current?.click()}
          >
            {busy ? te('uploading') : t('pinChange')}
          </button>
          <p className="w-full text-xs text-white/75">{t('pinHelp')}</p>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

// ───────────────────────── Completar espacios ─────────────────────────

function BlanksEditor({ question, readOnly }: Props) {
  const t = useTranslations('editor.types');
  const tc = useTranslations('common');
  const update = useEditorStore((s) => s.updateQuestion);
  const parts = blankParts(question.prompt);
  const holes = Math.max(parts.length - 1, 0);
  const blanks = question.config.blanks ?? [];

  // Mantiene un grupo de variantes por cada "___" del enunciado
  const sync = (q: QuestionDoc) => {
    const n = (q.prompt.match(/_{3,}/g) ?? []).length;
    const list = [...(q.config.blanks ?? [])];
    while (list.length < n) list.push(['']);
    q.config.blanks = list.slice(0, Math.max(n, 0));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl bg-white/95 px-4 py-4 text-center text-lg font-bold text-[#1a1640] shadow-lg">
        {holes === 0 ? (
          <span className="opacity-60">{t('blanksHow')}</span>
        ) : (
          parts.map((p, i) => (
            <span key={i}>
              {p}
              {i < holes && (
                <span className="mx-1 inline-block min-w-16 rounded-lg border-b-4 border-[var(--primary)] bg-[#1a1640]/10 px-2">
                  {blanks[i]?.find((v) => v.trim()) || '?'}
                </span>
              )}
            </span>
          ))
        )}
      </div>
      {!readOnly && (
        <div className={panel}>
          <p className="mb-1 text-sm font-extrabold">✏️ {t('blanksTitle')}</p>
          <p className="mb-3 text-xs text-white/75">{t('blanksHelp')}</p>
          {holes !== blanks.length && (
            <button
              type="button"
              onClick={() => update(question.id, sync)}
              className="mb-3 rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-black text-[#1a1640]"
            >
              {t('blanksSync', { n: holes })}
            </button>
          )}
          <ol className="flex flex-col gap-3">
            {blanks.map((variants, i) => (
              <li key={i} className="flex flex-col gap-2">
                <span className="text-xs font-black">{t('blankN', { n: i + 1 })}</span>
                {variants.map((v, j) => (
                  <div key={j} className="flex gap-2">
                    <input
                      value={v}
                      maxLength={80}
                      placeholder={t('blankAnswer')}
                      aria-label={`${t('blankN', { n: i + 1 })} · ${j + 1}`}
                      onChange={(e) =>
                        update(question.id, (q) => {
                          const list = q.config.blanks ?? [];
                          if (list[i]) list[i]![j] = e.target.value;
                        })
                      }
                      className={input}
                    />
                    {variants.length > 1 && (
                      <button
                        type="button"
                        aria-label={tc('remove')}
                        className={removeBtn}
                        onClick={() =>
                          update(question.id, (q) => {
                            const list = q.config.blanks ?? [];
                            if (list[i]) list[i] = list[i]!.filter((_, k) => k !== j);
                          })
                        }
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                ))}
                {variants.length < LIMITS.acceptedAnswers.max && (
                  <button
                    type="button"
                    className="flex cursor-pointer items-center gap-1 self-start text-xs font-bold text-white/85 hover:text-white"
                    onClick={() =>
                      update(question.id, (q) => {
                        q.config.blanks?.[i]?.push('');
                      })
                    }
                  >
                    <Plus className="size-3.5" strokeWidth={3} /> {t('addVariant')}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Nube de palabras ─────────────────────────

function CloudEditor({ question, readOnly }: Props) {
  const t = useTranslations('editor.types');
  const update = useEditorStore((s) => s.updateQuestion);
  const max = question.config.maxWords ?? 3;
  const sample = ['alegría', 'equipo', 'música', 'aprender', 'risa', 'juego', 'amigos'];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-2xl bg-white/95 px-4 py-6 font-display font-black text-[#1a1640] shadow-lg">
        {sample.map((w, i) => (
          <span
            key={w}
            style={{ fontSize: `${2.2 - (i % 4) * 0.4}rem`, opacity: 1 - (i % 3) * 0.2 }}
          >
            {w}
          </span>
        ))}
      </div>
      {!readOnly && (
        <div className={cn(panel, 'flex flex-wrap items-center gap-3')}>
          <span className="text-sm font-extrabold">{t('maxWords')}</span>
          <div className="flex gap-1.5" role="radiogroup" aria-label={t('maxWords')}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={max === n}
                onClick={() => update(question.id, (q) => void (q.config.maxWords = n))}
                className={cn(
                  'grid size-10 cursor-pointer place-items-center rounded-xl font-black',
                  max === n ? 'bg-white text-[#1a1640]' : 'bg-white/15 hover:bg-white/25',
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="w-full text-xs text-white/75">{t('cloudHelp')}</p>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Pregunta abierta ─────────────────────────

function OpenVotePreview() {
  const t = useTranslations('editor.types');
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl bg-white/95 p-4 text-[#1a1640] shadow-lg">
        <p className="text-xs font-black tracking-wider uppercase opacity-60">
          1 · {t('voteStep1')}
        </p>
        <p className="mt-2 rounded-xl bg-[#1a1640]/10 px-3 py-3 font-bold opacity-60">✍️ …</p>
      </div>
      <div className="rounded-2xl bg-white/95 p-4 text-[#1a1640] shadow-lg">
        <p className="text-xs font-black tracking-wider uppercase opacity-60">
          2 · {t('voteStep2')}
        </p>
        <p className="mt-2 rounded-xl bg-[#ffe14d] px-3 py-3 font-bold">🗳️ 👍 👍 👍</p>
      </div>
      <p className="col-span-full text-center text-xs text-white/80">{t('voteHelp')}</p>
    </div>
  );
}

// ───────────────────────── Dibujo rápido ─────────────────────────

function DrawEditor({ question, readOnly }: Props) {
  const t = useTranslations('editor.types');
  const tc = useTranslations('common');
  const update = useEditorStore((s) => s.updateQuestion);
  const [draft, setDraft] = useState('');
  const words = question.config.drawWords ?? [];

  function add() {
    const w = draft.trim().slice(0, 40);
    if (!w || words.length >= 20) return;
    update(question.id, (q) => void (q.config.drawWords = [...(q.config.drawWords ?? []), w]));
    setDraft('');
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
        <div className="grid aspect-[4/3] place-items-center rounded-2xl bg-white text-6xl shadow-lg">
          🎨
        </div>
        <div className="flex flex-col justify-center gap-2 rounded-2xl bg-white/95 p-4 text-sm font-bold text-[#1a1640] shadow-lg">
          <p>✏️ {t('drawHow1')}</p>
          <p>💬 {t('drawHow2')}</p>
          <p>🏆 {t('drawHow3')}</p>
        </div>
      </div>
      <div className={panel}>
        <p className="mb-3 text-sm font-extrabold">{t('drawWords')}</p>
        <ul className="mb-3 flex flex-wrap gap-2">
          {words.map((w, i) => (
            <li
              key={`${w}-${i}`}
              className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-sm font-bold text-[#1a1640]"
            >
              {w}
              {!readOnly && (
                <button
                  type="button"
                  aria-label={`${tc('remove')} ${w}`}
                  className="cursor-pointer"
                  onClick={() =>
                    update(
                      question.id,
                      (q) =>
                        void (q.config.drawWords = (q.config.drawWords ?? []).filter(
                          (_, j) => j !== i,
                        )),
                    )
                  }
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
          {words.length === 0 && <li className="text-sm text-white/75">{t('drawEmpty')}</li>}
        </ul>
        {!readOnly && words.length < 20 && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <input
              value={draft}
              maxLength={40}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('drawPlaceholder')}
              aria-label={t('drawPlaceholder')}
              className={input}
            />
            <button type="submit" className="rounded-xl bg-white px-4 font-black text-[#1a1640]">
              <Plus className="size-4" strokeWidth={3} />
            </button>
          </form>
        )}
        <p className="mt-3 text-xs text-white/75">{t('drawHelp')}</p>
      </div>
    </div>
  );
}

// ───────────────────────── Imagen revelada ─────────────────────────

/** Selector del número de piezas (va bajo las opciones). */
export function RevealTilesEditor({ question, readOnly }: Props) {
  const t = useTranslations('editor.types');
  const update = useEditorStore((s) => s.updateQuestion);
  const tiles = question.config.revealTiles ?? 16;
  if (readOnly) return null;
  return (
    <div className={cn(panel, 'mt-3 flex flex-wrap items-center gap-3')}>
      <span className="text-sm font-extrabold">🧩 {t('revealTiles')}</span>
      {[9, 16, 25, 36].map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={tiles === n}
          onClick={() => update(question.id, (q) => void (q.config.revealTiles = n))}
          className={cn(
            'cursor-pointer rounded-xl px-3 py-2 text-sm font-black',
            tiles === n ? 'bg-white text-[#1a1640]' : 'bg-white/15 hover:bg-white/25',
          )}
        >
          {Math.sqrt(n)}×{Math.sqrt(n)}
        </button>
      ))}
      <p className="w-full text-xs text-white/75">{t('revealHelp')}</p>
    </div>
  );
}
