'use client';
// Pantalla grande: cómo se muestra cada tipo de pregunta de la Fase 4 mientras está abierta
// y su revelación (histograma, mapa de toques, nube, votos, dibujo…).
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import {
  seededRandom,
  shuffle,
  type PublicQuestion,
  type RevealExtra,
  type Stroke,
  type VoteCandidate,
} from '@quiz-rush/shared';
import { answerStyle } from '@/components/ui/answer-shape';
import { cn } from '@/lib/utils';
import { StrokeCanvas } from './draw-canvas';

/** Contenido específico del tipo mientras la pregunta está abierta (null = vista clásica). */
export function ScreenQuestionExtra({
  question,
  progress,
  cloud,
  strokes,
}: {
  question: PublicQuestion;
  /** 0..1: tiempo transcurrido (para la imagen que se va revelando) */
  progress: number;
  cloud: [string, number][];
  strokes: Stroke[];
}) {
  const t = useTranslations('game.screenViews');
  const extra = question.extra;
  if (!extra) return null;
  switch (extra.kind) {
    case 'order':
      return (
        <ul className="mx-auto flex w-full max-w-3xl flex-col gap-2">
          {extra.items.map((item, i) => (
            <motion.li
              key={item.id}
              initial={{ opacity: 0, x: i % 2 ? 40 : -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              className={cn(
                'rounded-2xl px-5 py-3 font-display text-2xl font-extrabold text-[#1a1640] shadow-[0_5px_0_0_rgba(0,0,0,.25)]',
                answerStyle(i).bg,
              )}
            >
              {item.text}
            </motion.li>
          ))}
          <li className="text-center font-bold text-white/85">↕️ {t('orderHint')}</li>
        </ul>
      );
    case 'match':
      return (
        <div className="mx-auto grid w-full max-w-4xl grid-cols-2 gap-6">
          {[extra.left, extra.right].map((col, c) => (
            <ul key={c} className="flex flex-col gap-2">
              {col.map((item, i) => (
                <li
                  key={item.id}
                  className={cn(
                    'rounded-2xl px-4 py-3 text-center font-display text-xl font-extrabold shadow-lg',
                    c === 0
                      ? cn(answerStyle(i).bg, 'text-[#1a1640]')
                      : 'border-4 border-dashed border-white/70 bg-black/25 text-white',
                  )}
                >
                  {item.text}
                </li>
              ))}
            </ul>
          ))}
        </div>
      );
    case 'slider':
      return (
        <div className="mx-auto w-full max-w-4xl rounded-3xl bg-white/95 px-8 py-8 text-[#1a1640] shadow-xl">
          <div className="h-5 rounded-full bg-gradient-to-r from-[#22d3ee] via-[#a78bfa] to-[#ff3d9a]" />
          <div className="mt-3 flex justify-between font-display text-3xl font-black">
            <span>
              {extra.min} {extra.unit}
            </span>
            <span className="text-xl opacity-60">🎚️ {t('sliderHint')}</span>
            <span>
              {extra.max} {extra.unit}
            </span>
          </div>
        </div>
      );
    case 'pin':
      return (
        // eslint-disable-next-line @next/next/no-img-element -- imagen del autor del quiz
        <img
          src={extra.imageUrl}
          alt=""
          className="mx-auto max-h-[42vh] rounded-3xl object-contain shadow-xl"
        />
      );
    case 'reveal':
      return question.media?.kind === 'image' || question.media?.kind === 'gif' ? (
        <RevealImage
          url={question.media.url}
          tiles={extra.tiles}
          progress={progress}
          seed={question.prompt}
        />
      ) : null;
    case 'cloud':
      return cloud.length ? (
        <WordCloud words={cloud} />
      ) : (
        <p className="m-auto font-display text-3xl font-black text-white/80">
          ☁️ {t('cloudWaiting')}
        </p>
      );
    case 'vote':
      return (
        <p className="m-auto font-display text-3xl font-black text-white/85">
          ✍️ {t('voteWriting')}
        </p>
      );
    case 'draw':
      return (
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-3">
          {extra.drawer && (
            <p className="font-display text-2xl font-black text-white">
              🎨 {t('drawer', { nick: `${extra.drawer.avatar} ${extra.drawer.nick}` })}
            </p>
          )}
          {/* Se limita el ANCHO (no el alto) para conservar la proporción 4:3 del lienzo */}
          <div className="w-full max-w-[52vh]">
            <StrokeCanvas strokes={strokes} />
          </div>
          <p className="font-display text-4xl font-black tracking-[0.35em] text-white">
            {'_ '.repeat(extra.wordLength).trim()}
          </p>
        </div>
      );
    default:
      return null;
  }
}

/** Imagen tapada por piezas que se van quitando a medida que pasa el tiempo. */
export function RevealImage({
  url,
  tiles,
  progress,
  seed,
}: {
  url: string;
  tiles: number;
  progress: number;
  seed: string;
}) {
  const side = Math.round(Math.sqrt(tiles));
  const count = side * side;
  // Orden de destape fijo para la pregunta (igual en todas las pantallas)
  const order = useMemo(
    () =>
      shuffle(
        Array.from({ length: count }, (_, i) => i),
        seededRandom(seed),
      ),
    [count, seed],
  );
  // Al empezar se ve un 10 %; al final del tiempo, el 85 % (la revelación lo muestra todo)
  const visible = Math.floor(count * Math.min(0.85, 0.1 + progress * 0.75));
  const shown = new Set(order.slice(0, visible));
  return (
    <div className="relative mx-auto w-full max-w-[min(42rem,52vh)] overflow-hidden rounded-3xl shadow-xl">
      {/* eslint-disable-next-line @next/next/no-img-element -- imagen del autor del quiz */}
      <img src={url} alt="" className="block w-full" />
      <div
        className="absolute inset-0 grid"
        style={{
          gridTemplateColumns: `repeat(${side}, 1fr)`,
          gridTemplateRows: `repeat(${side}, 1fr)`,
        }}
        aria-hidden="true"
      >
        {Array.from({ length: count }, (_, i) => (
          <motion.span
            key={i}
            initial={false}
            animate={
              shown.has(i)
                ? { opacity: 0, scale: 0.6, rotate: 20 }
                : { opacity: 1, scale: 1, rotate: 0 }
            }
            transition={{ duration: 0.45 }}
            className={cn('border border-black/20', answerStyle(i).bg)}
          />
        ))}
      </div>
    </div>
  );
}

/** Nube de palabras: tamaño según cuántas veces se escribió. */
export function WordCloud({ words }: { words: [string, number][] }) {
  const max = Math.max(1, ...words.map(([, n]) => n));
  // Orden alterno (grandes en el centro) para que parezca una nube
  const arranged = useMemo(() => {
    const top = words.slice(0, 40);
    const out: [string, number][] = [];
    top.forEach((w, i) => (i % 2 ? out.push(w) : out.unshift(w)));
    return out;
  }, [words]);
  const colors = ['#ffe14d', '#22d3ee', '#ff3d9a', '#a3e635', '#fb923c', '#ffffff', '#a78bfa'];
  return (
    <ul
      className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-6 gap-y-2 py-4"
      aria-label="☁️"
    >
      {arranged.map(([word, n], i) => (
        <motion.li
          key={word}
          layout
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16 }}
          className="font-display leading-none font-black drop-shadow-[0_3px_0_rgba(0,0,0,.35)]"
          style={{ fontSize: `${1.4 + (n / max) * 3.6}rem`, color: colors[i % colors.length] }}
          title={`${word} ×${n}`}
        >
          {word}
        </motion.li>
      ))}
    </ul>
  );
}

/** Votación de la pregunta abierta en la pantalla grande. */
export function ScreenVote({ candidates }: { candidates: VoteCandidate[] }) {
  const t = useTranslations('game.screenViews');
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <p className="text-center font-display text-3xl font-black text-white">🗳️ {t('voteNow')}</p>
      <ul className="grid gap-3 md:grid-cols-2">
        {candidates.map((c, i) => (
          <motion.li
            key={c.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className={cn(
              'rounded-2xl px-5 py-4 font-display text-xl font-extrabold text-[#1a1640] shadow-[0_5px_0_0_rgba(0,0,0,.25)]',
              answerStyle(i).bg,
            )}
          >
            “{c.text}”
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

// ───────────────────────── Revelación ─────────────────────────

export function RevealExtraView({ extra, prompt }: { extra: RevealExtra; prompt: string }) {
  const t = useTranslations('game.screenViews');
  switch (extra.kind) {
    case 'order':
      return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
          <ol className="flex flex-col gap-2">
            {extra.correct.map((item, i) => (
              <motion.li
                key={item.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.12 }}
                className={cn(
                  'flex items-center gap-3 rounded-2xl px-5 py-3 font-display text-2xl font-extrabold text-[#1a1640] ring-4 ring-white',
                  answerStyle(i).bg,
                )}
              >
                <span className="grid size-10 place-items-center rounded-xl bg-white/50">
                  {i + 1}
                </span>
                {item.text}
              </motion.li>
            ))}
          </ol>
          <Summary text={t('fullyCorrect', { count: extra.fullyCorrect })} />
        </div>
      );
    case 'match':
      return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-2">
          <ul className="flex flex-col gap-2">
            {extra.pairs.map((p, i) => (
              <motion.li
                key={`${p.left}-${i}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1 }}
                className="grid grid-cols-[1fr_auto_1fr] items-center gap-3"
              >
                <span
                  className={cn(
                    'rounded-2xl px-4 py-3 text-center font-display text-xl font-extrabold text-[#1a1640]',
                    answerStyle(i).bg,
                  )}
                >
                  {p.left}
                </span>
                <span className="text-3xl text-white" aria-hidden="true">
                  ⟷
                </span>
                <span
                  className={cn(
                    'rounded-2xl px-4 py-3 text-center font-display text-xl font-extrabold text-[#1a1640]',
                    answerStyle(i).bg,
                  )}
                >
                  {p.right}
                </span>
              </motion.li>
            ))}
          </ul>
          <Summary text={t('fullyCorrect', { count: extra.fullyCorrect })} />
        </div>
      );
    case 'slider':
      return <SliderHistogram {...extra} />;
    case 'pin':
      return (
        <div className="relative mx-auto w-fit max-w-3xl overflow-hidden rounded-3xl shadow-xl">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen del autor del quiz */}
          <img src={extra.imageUrl} alt="" className="block max-h-[52vh] w-auto" />
          {extra.taps.slice(0, 600).map(([x, y], i) => (
            <span
              key={i}
              aria-hidden="true"
              className="absolute z-10 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-[#ff3d9a]/80"
              style={{ left: `${x}%`, top: `${y}%` }}
            />
          ))}
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.4 }}
            aria-hidden="true"
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-[#12a150]/35"
            style={{
              left: `${extra.x}%`,
              top: `${extra.y}%`,
              width: `${extra.radius * 2}%`,
              height: `${extra.radius * 2}%`,
            }}
          />
          <span
            aria-hidden="true"
            className="absolute -translate-x-1/2 -translate-y-full text-5xl drop-shadow-lg"
            style={{ left: `${extra.x}%`, top: `${extra.y}%` }}
          >
            📍
          </span>
        </div>
      );
    case 'blanks':
      return (
        <p className="mx-auto max-w-4xl rounded-3xl bg-white/95 px-6 py-5 text-center font-display text-3xl leading-relaxed font-extrabold text-[#1a1640] shadow-xl">
          {extra.parts.map((p, i) => (
            <span key={i}>
              {p}
              {i < extra.answers.length && (
                <span className="mx-1 rounded-xl bg-[#12a150] px-3 text-white">
                  {extra.answers[i]}
                </span>
              )}
            </span>
          ))}
        </p>
      );
    case 'cloud':
      return extra.words.length ? (
        <WordCloud words={extra.words} />
      ) : (
        <Summary text={t('cloudEmpty')} />
      );
    case 'vote':
      return (
        <ol className="mx-auto flex w-full max-w-4xl flex-col gap-2">
          {extra.answers.slice(0, 6).map((a, i) => (
            <motion.li
              key={`${a.nick}-${i}`}
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.12 }}
              className={cn(
                'flex items-center gap-3 rounded-2xl px-5 py-3 text-[#1a1640] shadow-lg',
                i === 0 ? 'bg-[#ffe14d] ring-4 ring-white' : 'bg-white/90',
              )}
            >
              <span className="text-2xl" aria-hidden="true">
                {i === 0 ? '👑' : a.avatar}
              </span>
              <span className="flex-1 font-display text-xl font-extrabold">“{a.text}”</span>
              <span className="text-sm font-bold">{a.nick}</span>
              <span className="rounded-full bg-[#1a1640] px-3 py-1 font-black text-white">
                👍 {a.votes}
              </span>
            </motion.li>
          ))}
          {extra.answers.length === 0 && <Summary text={t('noVotes')} />}
        </ol>
      );
    case 'draw':
      return (
        <div className="mx-auto flex flex-col items-center gap-3 text-center text-white">
          <motion.p
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="rounded-3xl bg-white px-8 py-4 font-display text-5xl font-black text-[#1a1640] shadow-xl"
          >
            {extra.word}
          </motion.p>
          <p className="text-xl font-bold">
            {extra.drawer && `🎨 ${extra.drawer.avatar} ${extra.drawer.nick} · `}
            {t('guessed', { count: extra.guessed })}
          </p>
        </div>
      );
    default:
      return <p className="sr-only">{prompt}</p>;
  }
}

function Summary({ text }: { text: string }) {
  return <p className="text-center text-xl font-extrabold text-white">{text}</p>;
}

/** Histograma de valores del deslizador con la zona correcta y la media de la clase. */
function SliderHistogram({
  correct,
  tolerance,
  min,
  max,
  unit,
  histogram,
  average,
}: Extract<RevealExtra, { kind: 'slider' }>) {
  const t = useTranslations('game.screenViews');
  const top = Math.max(1, ...histogram);
  const range = Math.max(max - min, 1e-9);
  const pct = (v: number) => `${Math.min(100, Math.max(0, ((v - min) / range) * 100))}%`;
  return (
    <div className="mx-auto w-full max-w-4xl rounded-3xl bg-white/95 px-6 pt-6 pb-4 text-[#1a1640] shadow-xl">
      <div className="relative">
        {/* Zona que da puntos */}
        <div
          aria-hidden="true"
          className="absolute inset-y-0 rounded-xl bg-[#12a150]/20"
          style={{
            left: pct(correct - tolerance),
            right: `calc(100% - ${pct(correct + tolerance)})`,
          }}
        />
        <div className="relative flex h-44 items-end gap-1" role="img" aria-label={t('histogram')}>
          {histogram.map((n, i) => (
            <motion.div
              key={i}
              className="flex-1 rounded-t-lg bg-[#a78bfa]"
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(2, (n / top) * 100)}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 18, delay: i * 0.04 }}
              title={String(n)}
            />
          ))}
        </div>
        <span
          className="absolute -top-2 h-[calc(100%+0.5rem)] w-1 -translate-x-1/2 rounded bg-[#12a150]"
          style={{ left: pct(correct) }}
          aria-hidden="true"
        />
        {average !== null && (
          <span
            className="absolute -top-2 h-[calc(100%+0.5rem)] w-1 -translate-x-1/2 rounded border-l-2 border-dashed border-[#ff3d9a]"
            style={{ left: pct(average) }}
            aria-hidden="true"
          />
        )}
      </div>
      <div className="mt-2 flex justify-between text-sm font-bold opacity-70">
        <span>{min}</span>
        <span>{max}</span>
      </div>
      <p className="mt-2 flex flex-wrap justify-center gap-x-6 font-display text-2xl font-black">
        <span className="text-[#12a150]">
          ✅ {correct}
          {unit ? ` ${unit}` : ''} (±{tolerance})
        </span>
        {average !== null && (
          <span className="text-[#ff3d9a]">
            📊 {t('average')}: {Math.round(average * 100) / 100}
            {unit ? ` ${unit}` : ''}
          </span>
        )}
      </p>
    </div>
  );
}
