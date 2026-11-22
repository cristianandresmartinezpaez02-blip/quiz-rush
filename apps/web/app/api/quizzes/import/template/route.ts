// GET /api/quizzes/import/template?format=csv|xlsx&lang=es|en → plantilla con ejemplos
import { route } from '@/lib/api';
import { downloadResponse, importTemplate } from '@/lib/quiz-io';

export const GET = route(async (req) => {
  const sp = new URL(req.url).searchParams;
  const format = sp.get('format') === 'csv' ? 'csv' : 'xlsx';
  const lang = sp.get('lang') === 'en' ? 'en' : 'es';
  return downloadResponse(await importTemplate(format, lang));
});
