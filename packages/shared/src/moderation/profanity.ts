// Filtro de palabras ofensivas (español e inglés) para apodos, títulos y comentarios.
// Se compara palabra por palabra tras normalizar (sin tildes, "leetspeak" y letras repetidas),
// así se evitan falsos positivos tipo "Scunthorpe" (p. ej. "computadora" no se bloquea).
// La moderación por IA (Fase 6) complementa este filtro para los casos que no detecta.

/** Insultos y groserías que nunca son aceptables. */
const SEVERE = [
  // Español
  'puta',
  'puto',
  'putas',
  'putos',
  'mierda',
  'mierdas',
  'cabron',
  'cabrona',
  'cabrones',
  'pendejo',
  'pendeja',
  'pendejos',
  'gilipollas',
  'coño',
  'joder',
  'jodete',
  'verga',
  'vergas',
  'chingada',
  'chingado',
  'chingatumadre',
  'culero',
  'culera',
  'maricon',
  'maricones',
  'hijueputa',
  'hijoputa',
  'malparido',
  'malparida',
  'gonorrea',
  'mamaguevo',
  'mamahuevo',
  'culiao',
  'pajero',
  'puñeta',
  'subnormal',
  'sudaca',
  // Inglés
  'fuck',
  'fucker',
  'fucking',
  'fucked',
  'motherfucker',
  'shit',
  'shitty',
  'bullshit',
  'bitch',
  'bitches',
  'asshole',
  'cunt',
  'dickhead',
  'pussy',
  'whore',
  'slut',
  'fag',
  'faggot',
  'nigger',
  'nigga',
  'retard',
  'retarded',
  'twat',
  'wanker',
  'kys',
];

/**
 * Palabras con un significado legítimo en contenido educativo ("cono" en geometría,
 * "nazi" en historia, "zorra" en biología) pero no aceptables como apodo.
 * Solo se aplican en modo estricto (nombres de usuario y apodos de partida).
 */
const AMBIGUOUS = [
  'marica',
  'zorra',
  'perra',
  'cono',
  'polla',
  'concha',
  'huevon',
  'weon',
  'imbecil',
  'idiota',
  'estupido',
  'nazi',
  'hitler',
  'violador',
  'pedofilo',
  'porno',
  'sexo',
  'pedo',
  'dick',
  'cock',
  'porn',
  'rape',
  'rapist',
  'pedophile',
  'bastard',
  'sex',
  'nude',
  'nudes',
];

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  $: 's',
  '!': 'i',
};

function normalizeWord(word: string): string {
  return (
    word
      .toLowerCase()
      .replace(/[01345789@$!]/g, (c) => LEET[c] ?? c)
      // La ñ es una letra distinta ("coño" ≠ "cono"): se conserva antes de quitar tildes
      .replace(/ñ/g, 'ny')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z]/g, '')
      // "puuuuta" → "puta"
      .replace(/(.)\1{2,}/g, '$1')
  );
}

const SEVERE_SET = new Set(SEVERE.map(normalizeWord));
const STRICT_SET = new Set([...SEVERE_SET, ...AMBIGUOUS.map(normalizeWord)]);

export interface ProfanityOptions {
  /** Modo estricto para apodos y nombres de usuario. */
  strict?: boolean;
}

/** Devuelve la primera palabra ofensiva encontrada o null. */
export function findProfanity(text: string, options: ProfanityOptions = {}): string | null {
  if (!text) return null;
  const set = options.strict ? STRICT_SET : SEVERE_SET;
  // Separar por espacios, signos, guiones y guiones bajos (apodos tipo "el_puto_amo")
  const tokens = text.split(/[\s\-_.,;:¡!¿?"'()[\]{}/\\|*+]+/);
  for (const token of tokens) {
    const w = normalizeWord(token);
    if (!w) continue;
    if (set.has(w)) return token;
    // Letras duplicadas colapsadas a una ("puttaa" → "puta")
    if (set.has(w.replace(/(.)\1+/g, '$1'))) return token;
  }
  // Palabras escondidas con separadores entre letras: "p.u.t.a" o "f u c k"
  if (/^(\S[\s._\-*]){2,}\S$/.test(text.trim())) {
    const joined = normalizeWord(text.replace(/[\s._\-*]+/g, ''));
    if (set.has(joined)) return text;
  }
  return null;
}

export function containsProfanity(text: string, options?: ProfanityOptions): boolean {
  return findProfanity(text, options) !== null;
}

/** Reemplaza las palabras ofensivas por asteriscos (útil para mostrar comentarios). */
export function censor(text: string): string {
  return text.replace(/[\p{Letter}\p{Number}@$!]+/gu, (token) =>
    findProfanity(token) ? '*'.repeat(token.length) : token,
  );
}
