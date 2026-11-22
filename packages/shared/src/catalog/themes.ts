// Temas visuales que el creador puede elegir para su quiz.
// Los colores se aplican como variables CSS sobre la vista del jugador y del anfitrión.

export interface QuizTheme {
  id: string;
  emoji: string;
  /** Degradado de fondo (de → a) */
  from: string;
  to: string;
  /** Color de acento para el temporizador y los detalles */
  accent: string;
  /** Patrón decorativo de fondo */
  pattern: 'stars' | 'leaves' | 'grid' | 'waves' | 'pixels' | 'dots' | 'embers' | 'snow';
}

export const QUIZ_THEMES: readonly QuizTheme[] = [
  { id: 'space', emoji: '🚀', from: '#0B0533', to: '#3A1C71', accent: '#FFE14D', pattern: 'stars' },
  {
    id: 'jungle',
    emoji: '🌴',
    from: '#06301F',
    to: '#1F7A3E',
    accent: '#C6F432',
    pattern: 'leaves',
  },
  { id: 'neon', emoji: '🌃', from: '#12002B', to: '#5B0A91', accent: '#FF3D9A', pattern: 'grid' },
  { id: 'ocean', emoji: '🌊', from: '#03224C', to: '#0D7EA8', accent: '#5EEAD4', pattern: 'waves' },
  {
    id: 'pixel',
    emoji: '👾',
    from: '#1B1B3A',
    to: '#2E4A7D',
    accent: '#7CFC00',
    pattern: 'pixels',
  },
  { id: 'candy', emoji: '🍭', from: '#FF7EB3', to: '#FFB86B', accent: '#FFFFFF', pattern: 'dots' },
  {
    id: 'volcano',
    emoji: '🌋',
    from: '#2A0A0A',
    to: '#A1260D',
    accent: '#FFB020',
    pattern: 'embers',
  },
  { id: 'arctic', emoji: '🧊', from: '#0F2A4A', to: '#5AA9E6', accent: '#E0F7FF', pattern: 'snow' },
];

export const DEFAULT_THEME_ID = 'space';

export function getTheme(id: string | null | undefined): QuizTheme {
  return QUIZ_THEMES.find((t) => t.id === id) ?? QUIZ_THEMES[0]!;
}

/** Pistas de música de fondo disponibles (archivos en /public/sounds/music). */
export const MUSIC_TRACKS = ['chill', 'arcade', 'epic', 'lofi', 'none'] as const;
export type MusicTrack = (typeof MUSIC_TRACKS)[number];
