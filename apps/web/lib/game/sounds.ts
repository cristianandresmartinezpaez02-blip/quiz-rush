'use client';
// Sonidos y música del juego (Howler.js). La música acelera cuando queda poco tiempo.
// El silencio se recuerda en el dispositivo.
import { Howl, Howler } from 'howler';

export type Sfx =
  'tick' | 'countdown' | 'go' | 'correct' | 'wrong' | 'join' | 'reveal' | 'pop' | 'fanfare';
export type Music = 'lobby' | 'question';

const MUTE_KEY = 'quizrush:muted';
const sfxCache = new Map<Sfx, Howl>();
const musicCache = new Map<Music, Howl>();
let currentMusic: Music | null = null;

const isBrowser = typeof window !== 'undefined';

export function isMuted(): boolean {
  return isBrowser && localStorage.getItem(MUTE_KEY) === '1';
}

const muteListeners = new Set<() => void>();

export function setMuted(muted: boolean) {
  if (!isBrowser) return;
  localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  Howler.mute(muted);
  muteListeners.forEach((l) => l());
}

/** Suscripción para useSyncExternalStore (el botón de silencio se mantiene sincronizado). */
export function subscribeMuted(listener: () => void) {
  muteListeners.add(listener);
  return () => {
    muteListeners.delete(listener);
  };
}

if (isBrowser) Howler.mute(isMuted());

function sfxHowl(name: Sfx) {
  let h = sfxCache.get(name);
  if (!h) {
    h = new Howl({
      src: [`/sounds/${name}.wav`],
      volume: name === 'tick' ? 0.35 : 0.7,
      preload: true,
    });
    sfxCache.set(name, h);
  }
  return h;
}

export function playSfx(name: Sfx) {
  if (!isBrowser) return;
  sfxHowl(name).play();
}

/** Precarga para que el primer sonido no llegue tarde. */
export function preloadSounds() {
  (
    ['countdown', 'go', 'correct', 'wrong', 'join', 'reveal', 'pop', 'fanfare', 'tick'] as Sfx[]
  ).forEach(sfxHowl);
}

export function playMusic(name: Music) {
  if (!isBrowser || currentMusic === name) return;
  stopMusic();
  let h = musicCache.get(name);
  if (!h) {
    h = new Howl({ src: [`/sounds/music-${name}.wav`], loop: true, volume: 0.25 });
    musicCache.set(name, h);
  }
  h.rate(1);
  h.fade(0, 0.25, 600);
  h.play();
  currentMusic = name;
}

/** Acelera la música (p. ej. 1.25 en los últimos segundos). */
export function setMusicRate(rate: number) {
  if (!currentMusic) return;
  musicCache.get(currentMusic)?.rate(rate);
}

export function stopMusic() {
  if (!currentMusic) return;
  const h = musicCache.get(currentMusic);
  h?.stop();
  currentMusic = null;
}
