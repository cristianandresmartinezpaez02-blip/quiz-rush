'use client';
// Efectos de celebración (confeti, fuegos artificiales) respetando "reducir animaciones".
import confetti from 'canvas-confetti';

const COLORS = ['#ffe14d', '#ff3d9a', '#22d3ee', '#a3e635', '#fb923c', '#a78bfa'];

function reduced(): boolean {
  if (typeof window === 'undefined') return true;
  return (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    document.documentElement.classList.contains('reduce-motion')
  );
}

export function burstConfetti(intensity = 1) {
  if (reduced()) return;
  confetti({
    particleCount: Math.round(90 * intensity),
    spread: 75,
    origin: { y: 0.7 },
    colors: COLORS,
    disableForReducedMotion: true,
  });
}

/** Fuegos artificiales durante unos segundos (podio). */
export function fireworks(durationMs = 3500) {
  if (reduced()) return;
  const end = Date.now() + durationMs;
  const timer = setInterval(() => {
    if (Date.now() > end) return clearInterval(timer);
    confetti({
      particleCount: 45,
      startVelocity: 32,
      spread: 360,
      ticks: 70,
      origin: { x: Math.random() * 0.8 + 0.1, y: Math.random() * 0.4 + 0.1 },
      colors: COLORS,
      disableForReducedMotion: true,
    });
  }, 280);
}

/** Lluvia lateral de confeti (ganador). */
export function sideCannons(durationMs = 2500) {
  if (reduced()) return;
  const end = Date.now() + durationMs;
  (function frame() {
    confetti({
      particleCount: 4,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors: COLORS,
      disableForReducedMotion: true,
    });
    confetti({
      particleCount: 4,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors: COLORS,
      disableForReducedMotion: true,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

/** Vibración corta en el celular (si el dispositivo lo permite). */
export function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
  } catch {
    /* algunos navegadores lo bloquean */
  }
}

/** Lluvia de emojis o formas (corazones, estrellas…) con canvas-confetti. */
function shapeRain(shapes: confetti.Shape[], colors: string[], scalar = 1.6) {
  if (reduced()) return;
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      confetti({
        particleCount: 40,
        spread: 100,
        startVelocity: 38,
        origin: { y: 0.65 },
        shapes,
        colors,
        scalar,
        disableForReducedMotion: true,
      });
    }, i * 250);
  }
}

/**
 * Celebración elegida en la tienda (código "celebration:<tipo>" o null = confeti).
 * Se usa al ganar un duelo, batir un récord o terminar con nota alta.
 */
export function celebrate(code: string | null | undefined) {
  if (reduced()) return;
  const kind = code?.split(':')[1] ?? 'confetti';
  switch (kind) {
    case 'fireworks':
      return fireworks(2500);
    case 'hearts':
      return shapeRain([confetti.shapeFromText({ text: '💖', scalar: 2 })], ['#ff3d9a'], 2);
    case 'stars':
      return shapeRain(['star'], ['#ffe14d', '#fff3b0', '#ffd23f'], 1.4);
    case 'emoji':
      return shapeRain(
        ['🤩', '🎉', '⚡'].map((text) => confetti.shapeFromText({ text, scalar: 2 })),
        ['#ffffff'],
        2,
      );
    default:
      return sideCannons(2000);
  }
}
