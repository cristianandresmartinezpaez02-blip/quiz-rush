// POST /api/internal/jobs/:name → ejecuta un trabajo en segundo plano. Solo lo llama el worker,
// con la cabecera `Authorization: Bearer <JOBS_SECRET>`. Sin secreto configurado, no existe.
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { JOB_NAMES, type JobName, type JobResult } from '@quiz-rush/shared';
import { ApiError, json, route } from '@/lib/api';
import { moderationBatch } from '@/lib/ai/moderate';
import { notifyFollowersPage } from '@/lib/community-service';
import { refreshTrendingAndSearch } from '@/lib/library-service';
import { dailyCleanup } from '@/lib/maintenance';
import { runLeagueClose } from '@/lib/progress-service';
import { deliverPendingPush } from '@/lib/push';
import { reindexAllQuizzes, syncQuizToSearch } from '@/lib/search';

// Los trabajos pueden tardar (p. ej. un lote de moderación con IA)
export const maxDuration = 300;

type Ctx = { params: Promise<{ name: string }> };

function authorized(req: Request) {
  const secret = process.env.JOBS_SECRET ?? '';
  const header = req.headers.get('authorization') ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (secret.length < 16 || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

const notifySchema = z.object({
  authorId: z.string().min(1),
  quizId: z.string().min(1),
  quizTitle: z.string(),
  cursor: z.string().optional(),
});

export const POST = route<Ctx>(async (req, { params }) => {
  // Sin secreto o con uno incorrecto la ruta "no existe" (no se revela que hay trabajos)
  if (!authorized(req)) throw new ApiError(404, 'NOT_FOUND');
  const name = (await params).name as JobName;
  if (!(JOB_NAMES as readonly string[]).includes(name)) throw new ApiError(404, 'NOT_FOUND');
  const body = req.headers.get('content-length') === '0' ? {} : await req.json().catch(() => ({}));

  let result: JobResult = { ok: true };
  switch (name) {
    case 'push':
      result = { ok: true, done: await deliverPendingPush() };
      break;
    case 'moderation':
      result = { ok: true, done: await moderationBatch() };
      break;
    case 'trending':
      result = { ok: true, done: await refreshTrendingAndSearch() };
      break;
    case 'league-close':
      await runLeagueClose();
      break;
    case 'cleanup':
      result = { ok: true, done: await dailyCleanup() };
      break;
    case 'notify-followers': {
      const job = notifySchema.parse(body);
      const page = await notifyFollowersPage(job.authorId, job.quizId, job.quizTitle, job.cursor);
      result = {
        ok: true,
        done: page.done,
        next: page.nextCursor ? { ...job, cursor: page.nextCursor } : null,
      };
      break;
    }
    case 'search-index': {
      // { all: true } → reindexado completo (npm run search:reindex)
      const job = z
        .union([z.object({ all: z.literal(true) }), z.object({ quizId: z.string().min(1) })])
        .parse(body);
      result = {
        ok: true,
        done:
          'all' in job ? await reindexAllQuizzes() : (await syncQuizToSearch(job.quizId)) ? 1 : 0,
      };
      break;
    }
  }
  return json(result);
});
