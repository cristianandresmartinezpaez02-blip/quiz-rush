// Categorías de la Biblioteca. El nombre visible se traduce en messages/*.json → categories.<id>.

export const CATEGORIES = [
  { id: 'general', emoji: '🧠' },
  { id: 'science', emoji: '🔬' },
  { id: 'history', emoji: '🏛️' },
  { id: 'geography', emoji: '🌍' },
  { id: 'math', emoji: '➗' },
  { id: 'languages', emoji: '🗣️' },
  { id: 'literature', emoji: '📚' },
  { id: 'art', emoji: '🎨' },
  { id: 'music', emoji: '🎵' },
  { id: 'movies', emoji: '🎬' },
  { id: 'sports', emoji: '⚽' },
  { id: 'technology', emoji: '💻' },
  { id: 'gaming', emoji: '🎮' },
  { id: 'nature', emoji: '🌿' },
  { id: 'food', emoji: '🍕' },
  { id: 'other', emoji: '✨' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as CategoryId[];
