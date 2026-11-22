// GET    /api/quizzes/:id   → estado del editor (borrador + revisión + problemas)
// PUT    /api/quizzes/:id   → autoguardado (cada 2 s desde el editor)
// DELETE /api/quizzes/:id   → borrado lógico
import { after } from 'next/server';
import { recordQuizPublished } from '@quiz-rush/db/progress';
import { autosaveRequestSchema } from '@quiz-rush/shared';
import { moderationSweep } from '@/lib/ai/moderate';
import { notifyFollowersOfPublish } from '@/lib/community-service';
import { enforceRateLimit, json, readJson, requireUser, route } from '@/lib/api';
import { autosaveQuiz, deleteQuiz, getQuizForEditor } from '@/lib/quiz-service';
import { publicQuizChanged } from '@/lib/public-changes';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id } = await params;
  return json(await getQuizForEditor(id, user.id));
});

export const PUT = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  // ~30 guardados/min es lo normal (cada 2 s); dejamos margen para varias pestañas
  await enforceRateLimit(req, 'autosave', 120, 60, user.id);
  const { id } = await params;
  const force = new URL(req.url).searchParams.get('force') === '1';
  const { baseRevision, doc } = await readJson(req, autosaveRequestSchema);
  const result = await autosaveQuiz(id, user.id, baseRevision, doc, { force });
  if (result.justPublished) {
    // Se ejecuta después de responder: el autoguardado no espera a avisar a miles de seguidores
    after(() =>
      notifyFollowersOfPublish(user.id, id, doc.title.trim()).catch((err) =>
        console.error('[notificaciones] error al avisar a los seguidores:', err),
      ),
    );
    // Misión "crea un quiz" y logros de creador (una sola vez por quiz)
    after(() =>
      recordQuizPublished(user.id, id).catch((err) =>
        console.error('[progreso] error al registrar la publicación:', err),
      ),
    );
  }
  // Cachés de búsqueda y buscador externo: la versión publicada cambió
  if (result.publishedChanged) after(() => publicQuizChanged(id));
  // Revisión con IA de lo publicado que ya no se está editando (como mucho cada 2 minutos)
  after(() =>
    moderationSweep().catch((err) => console.error('[moderación] barrido fallido:', err)),
  );
  return json(result);
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id } = await params;
  await deleteQuiz(id, user.id);
  after(() => publicQuizChanged(id));
  return json({ ok: true });
});
