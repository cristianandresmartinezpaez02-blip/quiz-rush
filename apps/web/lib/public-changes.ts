// Cuando cambia lo que el público ve de un quiz (se publica, se edita su versión publicada, se
// oculta, se aprueba o se borra), todo lo derivado debe enterarse a la vez:
//  • la caché de su página y de "similares",
//  • la caché de búsquedas de la Biblioteca (versión del grupo `library`),
//  • el buscador externo (Meilisearch), si está activo,
//  • las páginas guardadas para visitantes sin sesión (proxy.ts): ficha, Biblioteca y portada.
import 'server-only';
import { bumpVersion, invalidate } from './cache';
import { LOCALES } from '@/i18n/config';
import { redis } from './redis';
import { scheduleSearchSync } from './search';

export async function publicQuizChanged(...quizIds: string[]) {
  if (!quizIds.length) return;
  await invalidate(...quizIds.flatMap((id) => [`quiz:public:${id}`, `quiz:similar:${id}`]));
  await bumpVersion('library');
  const pages = ['/', '/biblioteca', ...quizIds.map((id) => `/quiz/${id}`)];
  await redis.del(...LOCALES.flatMap((l) => pages.map((p) => `page:${l}:${p}`))).catch(() => {});
  for (const id of quizIds) await scheduleSearchSync(id);
}
