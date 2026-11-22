// Claves de periodo (día y semana) en la zona horaria de la plataforma.
// Las misiones diarias, el reto diario, la racha y las ligas semanales usan estas claves:
// así "hoy" es el mismo día para todos, sin depender del reloj del dispositivo.

/** Zona horaria por defecto (se puede cambiar con la variable PROGRESS_TIMEZONE). */
export const DEFAULT_TIMEZONE = 'America/Bogota';

/** Fecha local "YYYY-MM-DD" en la zona indicada. */
export function dayKey(date: Date = new Date(), timeZone = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Semana ISO "YYYY-Www" (la semana empieza el lunes) del día local. */
export function weekKey(date: Date = new Date(), timeZone = DEFAULT_TIMEZONE): string {
  const [y, m, d] = dayKey(date, timeZone).split('-').map(Number) as [number, number, number];
  // Algoritmo ISO 8601: el jueves de la semana decide el año
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dow = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(utc.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((utc.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Día anterior a una clave "YYYY-MM-DD". */
export function previousDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d - 1));
  return date.toISOString().slice(0, 10);
}

/** Semana anterior a una clave "YYYY-Www". */
export function previousWeekKey(key: string): string {
  const [yearStr, weekStr] = key.split('-W') as [string, string];
  const year = Number(yearStr);
  const week = Number(weekStr);
  // Lunes de la semana pedida (el 4 de enero siempre está en la semana 1)
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (week - 1) * 7);
  monday.setUTCDate(monday.getUTCDate() - 7);
  return weekKey(new Date(monday.getTime() + 12 * 3_600_000), 'UTC');
}

/** Hora local (0–23) en la zona indicada. */
export function localHour(date: Date = new Date(), timeZone = DEFAULT_TIMEZONE): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(date),
  );
}

/** Hash estable de un texto (FNV-1a de 32 bits): elecciones deterministas por usuario y día. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
