'use client';
// Dibujo rápido: lienzo que pinta los trazos en vivo (pantalla y quienes adivinan) y pizarra
// de quien dibuja. Las coordenadas van en 0–1000 para que se vea igual en cualquier pantalla.
import { Eraser, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Stroke } from '@quiz-rush/shared';
import { cn } from '@/lib/utils';

/** Paleta permitida (la misma lista cerrada que valida el servidor). */
export const DRAW_COLORS = [
  '#1a1640',
  '#e5484d',
  '#fb923c',
  '#ffe14d',
  '#a3e635',
  '#22d3ee',
  '#a78bfa',
  '#f472b6',
  '#8b5a2b',
] as const;
const ERASER = '#ffffff';
const WIDTHS = [4, 10, 22] as const;
/** Cada cuánto se envía un lote de puntos mientras se dibuja */
const FLUSH_MS = 50;

function paint(ctx: CanvasRenderingContext2D, s: Stroke, scale: number) {
  if (s.p.length < 2) return;
  ctx.strokeStyle = s.c;
  ctx.fillStyle = s.c;
  ctx.lineWidth = s.w * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(s.p[0]! * scale, s.p[1]! * 0.75 * scale);
  if (s.p.length === 2) {
    // Un toque: un punto
    ctx.arc(s.p[0]! * scale, s.p[1]! * 0.75 * scale, (s.w * scale) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  for (let i = 2; i < s.p.length; i += 2) ctx.lineTo(s.p[i]! * scale, s.p[i + 1]! * 0.75 * scale);
  ctx.stroke();
}

/**
 * Lienzo 4:3 que pinta una lista de trazos. Solo dibuja lo nuevo cuando la lista crece
 * (miles de puntos sin redibujar todo en cada lote).
 */
export function StrokeCanvas({ strokes, className }: { strokes: Stroke[]; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawn = useRef(0);
  const [size, setSize] = useState(0);

  // Ajusta la resolución del lienzo a su tamaño real (nítido en pantallas retina)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize(Math.round(entry!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || !size) return;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(size * dpr);
    const fresh = el.width !== width || strokes.length < drawn.current;
    if (fresh) {
      el.width = width;
      el.height = Math.round(width * 0.75);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, el.width, el.height);
      drawn.current = 0;
    }
    const scale = el.width / 1000;
    for (let i = drawn.current; i < strokes.length; i++) paint(ctx, strokes[i]!, scale);
    drawn.current = strokes.length;
  }, [strokes, size]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="🎨"
      className={cn('aspect-[4/3] w-full touch-none rounded-2xl bg-white shadow-xl', className)}
    />
  );
}

/** Pizarra de quien dibuja: colores, grosor, goma y borrar todo. */
export function DrawingBoard({
  onStroke,
  onClear,
  disabled,
}: {
  onStroke: (s: Stroke) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations('game.draw');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState<string>(DRAW_COLORS[0]);
  const [width, setWidth] = useState<number>(WIDTHS[1]);
  const pending = useRef<number[]>([]);
  const last = useRef<[number, number] | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Primer lote del trazo: un toque sin movimiento también cuenta (un punto) */
  const firstBatch = useRef(true);

  const toPoint = (e: ReactPointerEvent<HTMLDivElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * 1000);
    // El alto es 3/4 del ancho: la coordenada Y se guarda también en escala 0–1000
    const y = Math.round(((e.clientY - r.top) / r.height) * 1000);
    return [Math.min(1000, Math.max(0, x)), Math.min(1000, Math.max(0, y))];
  };

  // Envía lo acumulado como un trazo; el siguiente lote empieza en el último punto (línea continua)
  const flush = () => {
    const pts = pending.current;
    // Tras el primer lote, el lote empieza con el último punto: hace falta al menos uno nuevo
    if (pts.length < (firstBatch.current ? 2 : 4)) return;
    firstBatch.current = false;
    const stroke: Stroke = { c: color, w: width, p: pts.slice(0, 240) };
    pending.current = last.current ? [...last.current] : [];
    setStrokes((s) => [...s, stroke]);
    onStroke(stroke);
  };

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    flush();
    pending.current = [];
    last.current = null;
  };

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn('relative', disabled && 'pointer-events-none opacity-70')}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = toPoint(e);
          last.current = p;
          pending.current = [...p];
          firstBatch.current = true;
          timer.current = setInterval(flush, FLUSH_MS);
        }}
        onPointerMove={(e) => {
          if (!timer.current) return;
          const p = toPoint(e);
          const [lx, ly] = last.current ?? p;
          // Descarta movimientos mínimos (menos datos por la red)
          if (Math.abs(p[0] - lx) + Math.abs(p[1] - ly) < 4) return;
          last.current = p;
          pending.current.push(...p);
          if (pending.current.length >= 236) flush();
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
      >
        <StrokeCanvas strokes={strokes} className="cursor-crosshair" />
      </div>
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={t('tools')}>
        {DRAW_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={c}
            aria-pressed={color === c}
            onClick={() => setColor(c)}
            className={cn(
              'size-9 cursor-pointer rounded-full border-4 shadow',
              color === c ? 'scale-110 border-white' : 'border-black/20',
            )}
            style={{ background: c }}
          />
        ))}
        <button
          type="button"
          aria-label={t('eraser')}
          aria-pressed={color === ERASER}
          onClick={() => setColor(ERASER)}
          className={cn(
            'grid size-9 cursor-pointer place-items-center rounded-full bg-white text-[#1a1640] shadow',
            color === ERASER && 'ring-4 ring-[var(--primary)]',
          )}
        >
          <Eraser className="size-5" />
        </button>
        <span className="mx-1 h-8 w-px bg-white/30" aria-hidden="true" />
        {WIDTHS.map((w) => (
          <button
            key={w}
            type="button"
            aria-label={t('width', { w })}
            aria-pressed={width === w}
            onClick={() => setWidth(w)}
            className={cn(
              'grid size-9 cursor-pointer place-items-center rounded-full bg-black/25',
              width === w && 'bg-white/90',
            )}
          >
            <span
              className="rounded-full bg-[#1a1640]"
              style={{ width: w / 1.5 + 3, height: w / 1.5 + 3 }}
            />
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setStrokes([]);
            onClear();
          }}
          className="ml-auto flex cursor-pointer items-center gap-1 rounded-xl bg-black/30 px-3 py-2 text-sm font-bold"
        >
          <Trash2 className="size-4" /> {t('clear')}
        </button>
      </div>
    </div>
  );
}
