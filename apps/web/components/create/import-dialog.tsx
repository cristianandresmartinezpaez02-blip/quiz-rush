'use client';
// Importar un quiz desde CSV o Excel: descargar la plantilla, subir el archivo y ver qué filas
// no se pudieron importar (las demás se crean como borrador).
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ImportResult } from '@quiz-rush/shared';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('create');
  const te = useTranslations('errors');
  const locale = useLocale();
  const lang = locale === 'en' ? 'en' : 'es';
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<ImportResult['errors'] | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setProblems(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('language', lang);
      const res = await fetch('/api/quizzes/import', { method: 'POST', body: form });
      const data = (await res.json().catch(() => null)) as
        | { id: string; imported: number; errors: ImportResult['errors'] }
        | { error: string; details?: { errors?: ImportResult['errors'] } }
        | null;
      if (!res.ok || !data || !('id' in data)) {
        const code = data && 'error' in data ? data.error : 'INTERNAL';
        if (data && 'error' in data && data.details?.errors?.length)
          setProblems(data.details.errors);
        toast.error(te.has(code) ? te(code as 'INTERNAL') : te('INTERNAL'));
        return;
      }
      toast.success(t('imported', { count: data.imported }));
      if (data.errors.length) toast.warning(t('importSkipped', { count: data.errors.length }));
      router.push(`/crear/${data.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`📥 ${t('importTitle')}`}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">{t('importHelp')}</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/quizzes/import/template?format=xlsx&lang=${lang}`}>
              <FileSpreadsheet className="size-4" /> {t('templateXlsx')}
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/quizzes/import/template?format=csv&lang=${lang}`}>
              <Download className="size-4" /> {t('templateCsv')}
            </a>
          </Button>
        </div>
        <input
          ref={input}
          type="file"
          accept=".csv,.xlsx,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = '';
          }}
        />
        <Button onClick={() => input.current?.click()} loading={busy}>
          <Upload className="size-4" /> {t('chooseFile')}
        </Button>
        {problems && problems.length > 0 && (
          <div role="alert" className="rounded-2xl bg-danger/10 p-3 text-sm">
            <p className="mb-1 font-bold">{t('importProblems')}</p>
            <ul className="max-h-40 list-disc overflow-y-auto pl-5">
              {problems.map((p) => (
                <li key={`${p.row}-${p.code}`}>
                  {t('importRow', { row: p.row, reason: t(`importErrors.${p.code}`) })}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
