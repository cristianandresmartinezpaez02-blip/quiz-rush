'use client';
// Estado de publicación: "En la biblioteca" o la lista de lo que falta para publicar.
import { Globe, ListChecks, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { ValidationIssue } from '@quiz-rush/shared';
import { useEditorStore } from '@/stores/editor-store';
import { cn } from '@/lib/utils';

export function PublishStatus({ issues }: { issues: ValidationIssue[] }) {
  const t = useTranslations('editor');
  const ti = useTranslations('issues');
  const status = useEditorStore((s) => s.status);
  const questions = useEditorStore((s) => s.doc.questions);
  const select = useEditorStore((s) => s.select);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const published = status === 'PUBLISHED';
  const hidden = status === 'HIDDEN';
  const ok = issues.length === 0;

  const label = hidden
    ? t('publish.hidden')
    : published && ok
      ? t('publish.published')
      : published
        ? t('issuesCount', { count: issues.length })
        : ok
          ? t('publish.publishing')
          : `${t('publish.draft')} · ${t('issuesCount', { count: issues.length })}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          'flex h-10 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-bold whitespace-nowrap',
          hidden && 'bg-danger/15 text-danger',
          !hidden && ok && 'bg-success/15 text-success',
          !hidden && !ok && 'bg-primary/20 text-fg',
        )}
      >
        {hidden ? (
          <ShieldAlert className="size-4" />
        ) : ok ? (
          <Globe className="size-4" />
        ) : (
          <ListChecks className="size-4" />
        )}
        <span className="hidden sm:inline">{label}</span>
      </button>
      {open && (
        <div className="card absolute right-0 z-30 mt-2 w-80 p-4 shadow-2xl">
          {ok && !hidden ? (
            <p className="text-sm font-semibold">
              {published ? `✅ ${t('publish.published')}` : `⏳ ${t('publish.willPublish')}`}
            </p>
          ) : (
            <>
              {published && !hidden && (
                <p className="mb-2 text-xs font-bold text-accent">{t('publish.unpublished')}</p>
              )}
              <p className="mb-2 text-sm font-bold">{t('publish.checklist')}</p>
              <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                {issues.map((issue, i) => {
                  const index = issue.questionId
                    ? questions.findIndex((q) => q.id === issue.questionId)
                    : -1;
                  return (
                    <li key={`${issue.code}-${issue.questionId ?? 'quiz'}-${i}`}>
                      <button
                        type="button"
                        className="w-full cursor-pointer rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                        onClick={() => {
                          if (issue.questionId) select(issue.questionId);
                          else document.getElementById('quiz-title')?.focus();
                          setOpen(false);
                        }}
                      >
                        <span className="font-bold text-accent">
                          {index >= 0 ? `#${index + 1} ` : '• '}
                        </span>
                        {ti(issue.code)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
