// GET /api/assignments/:id/report[?format=csv|xlsx] → informe de la tarea (solo profe)
import { json, requireUser, route } from '@/lib/api';
import { assignmentReport } from '@/lib/class-service';
import { assignmentReportRows } from '@/lib/report-rows';
import { downloadResponse, tableFile } from '@/lib/quiz-io';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const report = await assignmentReport(user.id, (await params).id);
  const format = new URL(req.url).searchParams.get('format');
  if (format === 'csv' || format === 'xlsx') {
    const lang = req.headers.get('cookie')?.includes('NEXT_LOCALE=en') ? 'en' : 'es';
    return downloadResponse(
      await tableFile(assignmentReportRows(report, lang), format, report.title),
    );
  }
  return json(report);
});
