// Genera los efectos de sonido y la música del juego por síntesis (audio 100 % original,
// sin derechos de terceros). Salida: apps/web/public/sounds/*.wav (PCM 16 bits, mono).
// Uso: node scripts/generate-sounds.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 22050;
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../apps/web/public/sounds');
mkdirSync(OUT, { recursive: true });

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12); // número MIDI → Hz

const waves = {
  sine: (p) => Math.sin(2 * Math.PI * p),
  square: (p) => (p % 1 < 0.5 ? 0.6 : -0.6),
  triangle: (p) => 1 - 4 * Math.abs((p % 1) - 0.5),
  saw: (p) => 2 * (p % 1) - 1,
};

/** Crea un búfer vacío de `seconds` segundos. */
const buffer = (seconds) => new Float32Array(Math.ceil(seconds * RATE));

/** Añade una nota con envolvente ADSR simple. */
function tone(
  buf,
  { start, dur, freq, freqEnd = freq, wave = 'square', vol = 0.3, attack = 0.005, release = 0.05 },
) {
  const s0 = Math.floor(start * RATE);
  const n = Math.floor(dur * RATE);
  let phase = 0;
  for (let i = 0; i < n && s0 + i < buf.length; i++) {
    const t = i / RATE;
    const f = freq + (freqEnd - freq) * (i / n);
    phase += f / RATE;
    const env = Math.min(1, t / attack) * Math.min(1, (dur - t) / release);
    buf[s0 + i] += waves[wave](phase) * vol * Math.max(0, env);
  }
}

/** Ruido filtrado (para "whoosh" y percusión). */
function noise(buf, { start, dur, vol = 0.2, decay = 8 }) {
  const s0 = Math.floor(start * RATE);
  let last = 0;
  for (let i = 0; i < dur * RATE && s0 + i < buf.length; i++) {
    const t = i / RATE;
    last = last * 0.7 + (Math.random() * 2 - 1) * 0.3; // paso bajo sencillo
    buf[s0 + i] += last * vol * Math.exp(-t * decay);
  }
}

function writeWav(name, buf) {
  // Normaliza para evitar saturación
  const peak = buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0.0001);
  const gain = Math.min(1, 0.9 / peak);
  const data = Buffer.alloc(buf.length * 2);
  buf.forEach((v, i) =>
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v * gain)) * 32767), i * 2),
  );
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(path.join(OUT, `${name}.wav`), Buffer.concat([header, data]));
  console.log(`✓ ${name}.wav (${((44 + data.length) / 1024).toFixed(0)} KB)`);
}

// ── Efectos ──
{
  const b = buffer(0.12);
  tone(b, { start: 0, dur: 0.1, freq: 1200, wave: 'triangle', vol: 0.4 });
  writeWav('tick', b);
}
{
  const b = buffer(0.25);
  tone(b, { start: 0, dur: 0.2, freq: NOTE(76), wave: 'square', vol: 0.3 });
  writeWav('countdown', b);
}
{
  const b = buffer(0.45);
  tone(b, { start: 0, dur: 0.4, freq: NOTE(88), wave: 'square', vol: 0.3 });
  tone(b, { start: 0, dur: 0.4, freq: NOTE(84), wave: 'triangle', vol: 0.2 });
  writeWav('go', b);
}
{
  const b = buffer(0.6);
  [72, 76, 79, 84].forEach((n, i) =>
    tone(b, { start: i * 0.08, dur: 0.25, freq: NOTE(n), wave: 'square', vol: 0.25 }),
  );
  writeWav('correct', b);
}
{
  const b = buffer(0.55);
  tone(b, { start: 0, dur: 0.22, freq: 220, freqEnd: 180, wave: 'saw', vol: 0.3 });
  tone(b, { start: 0.22, dur: 0.3, freq: 170, freqEnd: 110, wave: 'saw', vol: 0.3 });
  writeWav('wrong', b);
}
{
  const b = buffer(0.2);
  tone(b, { start: 0, dur: 0.15, freq: 500, freqEnd: 1400, wave: 'sine', vol: 0.5 });
  writeWav('join', b);
}
{
  const b = buffer(0.7);
  noise(b, { start: 0, dur: 0.6, vol: 0.5, decay: 5 });
  tone(b, { start: 0, dur: 0.5, freq: 300, freqEnd: 900, wave: 'triangle', vol: 0.15 });
  writeWav('reveal', b);
}
{
  const b = buffer(0.12);
  tone(b, { start: 0, dur: 0.08, freq: 900, freqEnd: 600, wave: 'sine', vol: 0.4 });
  writeWav('pop', b);
}
{
  // Fanfarria del podio
  const b = buffer(2.6);
  const seq = [
    [67, 0, 0.15],
    [67, 0.16, 0.15],
    [67, 0.32, 0.15],
    [72, 0.5, 0.9],
    [76, 1.0, 0.25],
    [79, 1.3, 1.2],
  ];
  seq.forEach(([n, s, d]) => {
    tone(b, { start: s, dur: d, freq: NOTE(n), wave: 'square', vol: 0.22, release: 0.1 });
    tone(b, { start: s, dur: d, freq: NOTE(n - 12), wave: 'triangle', vol: 0.18, release: 0.1 });
  });
  noise(b, { start: 1.3, dur: 1.2, vol: 0.15, decay: 3 });
  writeWav('fanfare', b);
}

// ── Música en bucle (los bucles cuadran al compás: sin cortes al repetirse) ──
function loop(name, { bpm, bars, chords, arpWave, bass = true }) {
  const beat = 60 / bpm;
  const b = buffer(bars * 4 * beat);
  for (let bar = 0; bar < bars; bar++) {
    const chord = chords[bar % chords.length];
    const t0 = bar * 4 * beat;
    // Arpegio en semicorcheas
    for (let s = 0; s < 16; s++) {
      const note = chord[s % chord.length] + (Math.floor(s / chord.length) % 2) * 12;
      tone(b, {
        start: t0 + (s * beat) / 4,
        dur: beat / 4.5,
        freq: NOTE(note),
        wave: arpWave,
        vol: 0.12,
        release: 0.03,
      });
    }
    if (bass) {
      for (let q = 0; q < 4; q++) {
        tone(b, {
          start: t0 + q * beat,
          dur: beat * 0.8,
          freq: NOTE(chord[0] - 24),
          wave: 'triangle',
          vol: 0.3,
          release: 0.08,
        });
      }
    }
    // Percusión: bombo en 1 y 3, "hi-hat" en contratiempos
    for (let q = 0; q < 4; q++) {
      if (q % 2 === 0)
        tone(b, {
          start: t0 + q * beat,
          dur: 0.12,
          freq: 120,
          freqEnd: 45,
          wave: 'sine',
          vol: 0.5,
        });
      noise(b, { start: t0 + q * beat + beat / 2, dur: 0.05, vol: 0.12, decay: 60 });
    }
  }
  writeWav(name, b);
}

loop('music-lobby', {
  bpm: 100,
  bars: 4,
  chords: [
    [60, 64, 67, 71],
    [57, 60, 64, 67],
    [65, 69, 72, 76],
    [67, 71, 74, 77],
  ],
  arpWave: 'triangle',
});
loop('music-question', {
  bpm: 128,
  bars: 4,
  chords: [
    [62, 65, 69],
    [58, 62, 65],
    [60, 64, 67],
    [57, 61, 64],
  ],
  arpWave: 'square',
});
