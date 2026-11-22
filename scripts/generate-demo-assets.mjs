// Genera el audio del quiz de demostración de tipos de pregunta (100 % sintetizado, original).
// Salida: apps/web/public/demo/pitidos.wav — cuatro pitidos (respuesta de la pregunta de audio).
// Uso: node scripts/generate-demo-assets.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 22050;
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../apps/web/public/demo');
mkdirSync(OUT, { recursive: true });

const seconds = 3.2;
const buf = new Float32Array(Math.ceil(seconds * RATE));
// Cuatro pitidos con notas distintas (do, mi, sol, do agudo)
const notes = [523.25, 659.25, 783.99, 1046.5];
notes.forEach((freq, k) => {
  const start = 0.3 + k * 0.7;
  const dur = 0.35;
  const s0 = Math.floor(start * RATE);
  for (let i = 0; i < dur * RATE; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / 0.01) * Math.min(1, (dur - t) / 0.08);
    buf[s0 + i] += Math.sin(2 * Math.PI * freq * t) * 0.45 * Math.max(0, env);
  }
});

const data = Buffer.alloc(buf.length * 2);
buf.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
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
writeFileSync(path.join(OUT, 'pitidos.wav'), Buffer.concat([header, data]));
console.log('✓ apps/web/public/demo/pitidos.wav');
