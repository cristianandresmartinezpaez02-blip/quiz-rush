'use client';
// Crear una tarea: elegir un quiz (míos publicados o de la Biblioteca), fecha límite, intentos,
// nota mínima, certificado y si cuenta la velocidad.
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { apiFetch } from '@/lib/client-api';
import { cn } from '@/lib/utils';

interface QuizOption {
  id: string;
  title: string;
  questionCount: number;
}

/** Fecha local "YYYY-MM-DDTHH:mm" para <input type="datetime-local"> */
function localInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AssignmentDialog({
  open,
  classId,
  onClose,
  onCreated,
}: {
  open: boolean;
  classId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations('classes');
  const te = useTranslations('errors');
  const [mine, setMine] = useState<QuizOption[]>([]);
  const [results, setResults] = useState<QuizOption[] | null>(null);
  const [query, setQuery] = useState('');
  const [quiz, setQuiz] = useState<QuizOption | null>(null);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(() => localInput(new Date(Date.now() + 7 * 86_400_000)));
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [passingScore, setPassingScore] = useState(60);
  const [certificate, setCertificate] = useState(true);
  const [speedEnabled, setSpeedEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void apiFetch<{ items: (QuizOption & { status: string })[] }>('/api/quizzes')
      .then((r) => setMine(r.items.filter((q) => q.status === 'PUBLISHED')))
      .catch(() => setMine([]));
  }, [open]);

  async function search() {
    if (query.trim().length < 2) return;
    const r = await apiFetch<{ items: QuizOption[] }>(
      `/api/library?q=${encodeURIComponent(query.trim())}`,
    ).catch(() => ({ items: [] }));
    setResults(r.items);
  }

  async function create() {
    if (!quiz) return;
    setBusy(true);
    try {
      await apiFetch(`/api/classes/${classId}/assignments`, {
        method: 'POST',
        body: {
          quizId: quiz.id,
          title: title.trim() || quiz.title,
          dueAt: new Date(due).toISOString(),
          settings: { maxAttempts, passingScore, certificate, speedEnabled },
        },
      });
      onCreated();
    } catch (err) {
      const c = (err as Error).message;
      toast.error(te.has(c) ? te(c as 'INTERNAL') : te('INTERNAL'));
    } finally {
      setBusy(false);
    }
  }

  const pick = (q: QuizOption) => (
    <li key={q.id}>
      <button
        type="button"
        onClick={() => {
          setQuiz(q);
          if (!title) setTitle(q.title);
        }}
        aria-pressed={quiz?.id === q.id}
        className={cn(
          'w-full cursor-pointer rounded-xl border-2 px-3 py-2 text-left text-sm font-bold',
          quiz?.id === q.id ? 'border-accent bg-accent/10' : 'border-line hover:border-accent/60',
        )}
      >
        {q.title}{' '}
        <span className="font-normal text-muted">
          · {t('questionsCount', { count: q.questionCount })}
        </span>
      </button>
    </li>
  );

  const field =
    'h-11 rounded-xl border-2 border-line bg-surface px-3 outline-none focus:border-accent';
  return (
    <Modal open={open} onClose={onClose} title={`📝 ${t('newAssignment')}`}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-2 text-sm font-bold">1. {t('pickQuiz')}</p>
          {mine.length > 0 && (
            <>
              <p className="mb-1 text-xs font-black tracking-wider text-muted uppercase">
                {t('myQuizzes')}
              </p>
              <ul className="mb-3 flex max-h-36 flex-col gap-1 overflow-y-auto">
                {mine.map(pick)}
              </ul>
            </>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchLibrary')}
              aria-label={t('searchLibrary')}
              className={cn(field, 'min-w-0 flex-1')}
            />
            <Button type="submit" variant="outline" size="icon" aria-label={t('searchLibrary')}>
              <Search className="size-4" />
            </Button>
          </form>
          {results && (
            <ul className="mt-2 flex max-h-36 flex-col gap-1 overflow-y-auto">
              {results.map(pick)}
            </ul>
          )}
        </div>
        <label className="flex flex-col gap-1 text-sm font-bold">
          2. {t('assignmentTitle')}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            className={field}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 flex flex-col gap-1 text-sm font-bold">
            {t('dueAt')}
            <input
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-bold">
            {t('maxAttempts')}
            <select
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(Number(e.target.value))}
              className={field}
            >
              {[1, 2, 3, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-bold">
            {t('passingScore')} ({passingScore}%)
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={passingScore}
              onChange={(e) => setPassingScore(Number(e.target.value))}
              className="accent-[var(--accent)]"
            />
          </label>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            checked={certificate}
            onChange={(e) => setCertificate(e.target.checked)}
            className="size-5"
          />
          🏅 {t('certificateOption')}
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            checked={speedEnabled}
            onChange={(e) => setSpeedEnabled(e.target.checked)}
            className="size-5"
          />
          ⚡ {t('speedOption')}
        </label>
        <Button onClick={create} disabled={!quiz} loading={busy}>
          {t('createAssignment')}
        </Button>
      </div>
    </Modal>
  );
}
