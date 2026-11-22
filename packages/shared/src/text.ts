// Utilidades de texto compartidas.

/**
 * Normaliza un texto para comparar respuestas escritas:
 * minúsculas, sin tildes ni diacríticos, sin signos de puntuación y espacios colapsados.
 * "¡Océano  Pacífico!" → "oceano pacifico"
 */
export function normalizeAnswer(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compara una respuesta escrita contra una lista de variantes aceptadas. */
export function matchesAcceptedAnswer(answer: string, accepted: readonly string[]): boolean {
  const normalized = normalizeAnswer(answer);
  if (!normalized) return false;
  return accepted.some((variant) => normalizeAnswer(variant) === normalized);
}

/** Convierte un texto en un slug apto para URLs: "Sistema Solar 2!" → "sistema-solar-2". */
export function slugify(input: string, maxLength = 60): string {
  return (
    normalizeAnswer(input).replace(/\s+/g, '-').slice(0, maxLength).replace(/-+$/g, '') || 'quiz'
  );
}
