// GET /api/reports/games/:id[?format=csv|xlsx] → informe de una partida en vivo (anfitrión)
import { json, requireUser, route } from '@/lib/api';
import { gameReport } from '@/lib/class-service';
import { gameReportRows } from '@/lib/report-rows';
import { downloadResponse, tableFile } from '@/lib/quiz-io';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const report = await gameReport(user.id, (await params).id);
  const format = new URL(req.url).searchParams.get('format');
  if (format === 'csv' || format === 'xlsx') {
    const lang = req.headers.get('cookie')?.includes('NEXT_LOCALE=en') ? 'en' : 'es';
    return downloadResponse(
      await tableFile(gameReportRows(report, lang), format, report.quiz?.title ?? 'partida'),
    );
  }
  return json(report);
});
