'use client';
// Una clase. Profe: código para compartir, tareas (crear, ver informe, borrar) y estudiantes.
// Estudiante: sus tareas con estado, intentos y mejor nota; jugarlas.
import {
  Award,
  BarChart3,
  ClipboardList,
  Copy,
  LogOut,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { AvatarArt } from '@/components/avatar/avatar-art';
import { StartSoloButton } from '@/components/solo/start-solo-button';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/client-api';
import type { getClass } from '@/lib/class-service';
import { cn } from '@/lib/utils';
import { AssignmentDialog } from './assignment-dialog';

type ClassData = Awaited<ReturnType<typeof getClass>>;

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export function ClassView({ initial, me, now }: { initial: ClassData; me: string; now: number }) {
  const t = useTranslations('classes');
  const te = useTranslations('errors');
  const format = useFormatter();
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<'assignments' | 'students'>('assignments');
  const [dialog, setDialog] = useState(false);
  const isTeacher = data.role === 'TEACHER';
  const errorText = (c: string) => (te.has(c) ? te(c as 'INTERNAL') : te('INTERNAL'));

  async function refresh() {
    setData(await apiFetch<ClassData>(`/api/classes/${data.id}`));
  }

  async function act(fn: () => Promise<unknown>, ok?: string) {
    try {
      await fn();
      if (ok) toast.success(ok);
      await refresh();
    } catch (err) {
      toast.error(errorText((err as Error).message));
    }
  }

  const joinLink = data.joinCode ? `${appUrl}/clases/unirse?code=${data.joinCode}` : '';

  return (
    <div className="flex flex-col gap-6">
      <header className="card flex flex-wrap items-center gap-4 p-5">
        <div className="min-w-[14rem] flex-1">
          <p className="text-sm font-bold text-muted">
            {isTeacher ? `👩‍🏫 ${t('youTeach')}` : `🎒 ${t('teacherIs', { name: data.teacher })}`}
          </p>
          <h1 className="text-3xl font-extrabold">{data.name}</h1>
          {data.description && <p className="text-muted">{data.description}</p>}
        </div>
        {isTeacher && data.joinCode && (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-surface-2 p-3">
            <span className="text-xs font-black tracking-widest text-muted uppercase">
              {t('codeLabel')}
            </span>
            <span className="font-display text-3xl font-black tracking-[0.3em]">
              {data.joinCode}
            </span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await navigator.clipboard.writeText(joinLink).catch(() => {});
                  toast.success(t('linkCopied'));
                }}
              >
                <Copy className="size-4" /> {t('copyLink')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  confirm(t('newCodeConfirm')) &&
                  void act(() =>
                    apiFetch(`/api/classes/${data.id}`, {
                      method: 'PATCH',
                      body: { newCode: true },
                    }),
                  )
                }
              >
                <RefreshCw className="size-4" /> {t('newCode')}
              </Button>
            </div>
          </div>
        )}
        {!isTeacher && (
          <Button
            variant="ghost"
            onClick={() =>
              confirm(t('leaveConfirm')) &&
              void apiFetch(`/api/classes/${data.id}/members/${me}`, { method: 'DELETE' })
                .then(() => router.push('/clases'))
                .catch((err: Error) => toast.error(errorText(err.message)))
            }
          >
            <LogOut className="size-4" /> {t('leave')}
          </Button>
        )}
      </header>

      {isTeacher && (
        <div role="tablist" className="flex gap-2">
          {(['assignments', 'students'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 font-extrabold',
                tab === k ? 'bg-accent text-accent-ink' : 'bg-surface-2 hover:bg-line',
              )}
            >
              {k === 'assignments' ? (
                <ClipboardList className="size-4" />
              ) : (
                <Users className="size-4" />
              )}
              {t(k === 'assignments' ? 'assignments' : 'students')}
              {k === 'students' && <span className="text-xs">({data.members.length - 1})</span>}
            </button>
          ))}
          {tab === 'assignments' && (
            <Button className="ml-auto" onClick={() => setDialog(true)}>
              <Plus className="size-4" /> {t('newAssignment')}
            </Button>
          )}
        </div>
      )}

      {(tab === 'assignments' || !isTeacher) && (
        <section aria-label={t('assignments')}>
          {data.assignments.length === 0 ? (
            <p className="card p-8 text-center text-muted">
              {isTeacher ? t('noAssignmentsTeacher') : t('noAssignments')}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.assignments.map((a) => {
                const due = new Date(a.dueAt).getTime();
                const closed = due < now;
                const left = a.mine ? a.maxAttempts - a.mine.attempts : 0;
                const passed =
                  a.mine?.best !== null &&
                  a.mine?.best !== undefined &&
                  a.mine.best >= a.passingScore;
                return (
                  <li key={a.id} className="card flex flex-wrap items-center gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-extrabold">{a.title}</p>
                      <p className="text-sm text-muted">
                        {a.quiz.title} · {t('questionsCount', { count: a.questionCount })}
                        {a.certificate && ` · 🏅 ${t('withCertificate')}`}
                      </p>
                      <p className={cn('text-sm font-bold', closed ? 'text-danger' : 'text-fg')}>
                        ⏰ {closed ? t('closedOn') : t('dueOn')}{' '}
                        {format.dateTime(new Date(a.dueAt), {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </p>
                    </div>
                    {isTeacher ? (
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-surface-2 px-3 py-1 text-sm font-bold">
                          {t('submissions', { count: a.submissions ?? 0 })}
                        </span>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/clases/${data.id}/tareas/${a.id}`}>
                            <BarChart3 className="size-4" /> {t('report')}
                          </Link>
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t('deleteAssignment')}
                          onClick={() =>
                            confirm(t('deleteAssignmentConfirm')) &&
                            void act(() =>
                              apiFetch(`/api/assignments/${a.id}`, { method: 'DELETE' }),
                            )
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-end gap-1">
                        {a.mine && a.mine.best !== null && (
                          <span
                            className={cn(
                              'rounded-full px-3 py-1 text-sm font-black',
                              passed ? 'bg-success/20 text-success' : 'bg-surface-2',
                            )}
                          >
                            {passed && <Award className="mr-1 inline size-4" />}
                            {t('best', { percent: a.mine.best })}
                          </span>
                        )}
                        <span className="text-xs font-bold text-muted">
                          {t('attemptsLeft', { count: Math.max(0, left) })}
                        </span>
                        <StartSoloButton
                          input={{ mode: 'ASSIGNMENT', assignmentId: a.id }}
                          size="sm"
                          disabled={closed || left <= 0}
                        >
                          {a.mine?.attempts ? t('retry') : t('start')}
                        </StartSoloButton>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {isTeacher && tab === 'students' && (
        <section aria-label={t('students')}>
          {data.members.filter((m) => m.role === 'STUDENT').length === 0 ? (
            <p className="card p-8 text-center text-muted">
              {t('noStudents', { code: data.joinCode ?? '' })}
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.members
                .filter((m) => m.role === 'STUDENT')
                .map((m) => (
                  <li key={m.userId} className="card flex items-center gap-3 p-3">
                    <AvatarArt config={m.avatar} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{m.displayName}</span>
                      <span className="text-xs text-muted">@{m.username}</span>
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t('removeStudent', { name: m.displayName })}
                      onClick={() =>
                        confirm(t('removeStudentConfirm', { name: m.displayName })) &&
                        void act(() =>
                          apiFetch(`/api/classes/${data.id}/members/${m.userId}`, {
                            method: 'DELETE',
                          }),
                        )
                      }
                    >
                      <X className="size-4" />
                    </Button>
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}

      {isTeacher && (
        <AssignmentDialog
          open={dialog}
          classId={data.id}
          onClose={() => setDialog(false)}
          onCreated={() => {
            setDialog(false);
            toast.success(t('assignmentCreated'));
            void refresh();
          }}
        />
      )}
    </div>
  );
}
