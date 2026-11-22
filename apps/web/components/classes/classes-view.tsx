'use client';
// Mis clases: las que doy (profe) y en las que estoy (estudiante); crear una clase o unirse con
// el código que da el profe.
import { GraduationCap, LogIn, Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { CLASS_CODE_LENGTH } from '@quiz-rush/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { apiFetch } from '@/lib/client-api';

export interface ClassItem {
  id: string;
  name: string;
  description: string | null;
  role: 'TEACHER' | 'STUDENT';
  joinCode: string | null;
  teacher: string;
  students: number;
  assignments: number;
}

export function ClassesView({ initial, isGuest }: { initial: ClassItem[]; isGuest: boolean }) {
  const t = useTranslations('classes');
  const te = useTranslations('errors');
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const errorText = (c: string) => (te.has(c) ? te(c as 'INTERNAL') : te('INTERNAL'));

  async function create() {
    setBusy('create');
    try {
      const { id } = await apiFetch<{ id: string }>('/api/classes', {
        method: 'POST',
        body: { name },
      });
      router.push(`/clases/${id}`);
    } catch (err) {
      toast.error(errorText((err as Error).message));
      setBusy(null);
    }
  }

  async function join() {
    setBusy('join');
    try {
      const { id } = await apiFetch<{ id: string }>('/api/classes/join', {
        method: 'POST',
        body: { code },
      });
      router.push(`/clases/${id}`);
    } catch (err) {
      toast.error(errorText((err as Error).message));
      setBusy(null);
    }
  }

  const teaching = initial.filter((c) => c.role === 'TEACHER');
  const learning = initial.filter((c) => c.role === 'STUDENT');
  const card =
    'card flex flex-col gap-1 p-5 transition hover:-translate-y-0.5 hover:border-accent/60';

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 md:grid-cols-2">
        <form
          className="card flex flex-col gap-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === CLASS_CODE_LENGTH) void join();
          }}
        >
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <LogIn className="size-5" /> {t('joinTitle')}
          </h2>
          <p className="text-sm text-muted">{t('joinHelp')}</p>
          <div className="flex gap-2">
            <label htmlFor="class-code" className="sr-only">
              {t('codeLabel')}
            </label>
            <input
              id="class-code"
              value={code}
              onChange={(e) =>
                setCode(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, CLASS_CODE_LENGTH),
                )
              }
              placeholder="ABC234"
              autoComplete="off"
              className="h-12 min-w-0 flex-1 rounded-2xl border-2 border-line bg-surface px-4 text-center font-display text-2xl font-black tracking-[0.25em] outline-none focus:border-accent"
            />
            <Button
              type="submit"
              disabled={code.length !== CLASS_CODE_LENGTH}
              loading={busy === 'join'}
            >
              {t('join')}
            </Button>
          </div>
        </form>
        <form
          className="card flex flex-col gap-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length >= 2) void create();
          }}
        >
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <GraduationCap className="size-5" /> {t('createTitle')}
          </h2>
          <p className="text-sm text-muted">{isGuest ? t('accountRequired') : t('createHelp')}</p>
          <div className="flex gap-2">
            <label htmlFor="class-name" className="sr-only">
              {t('nameLabel')}
            </label>
            <input
              id="class-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              disabled={isGuest}
              placeholder={t('namePlaceholder')}
              className="h-12 min-w-0 flex-1 rounded-2xl border-2 border-line bg-surface px-4 font-bold outline-none focus:border-accent"
            />
            <Button
              type="submit"
              variant="accent"
              disabled={isGuest || name.trim().length < 2}
              loading={busy === 'create'}
            >
              <Plus className="size-4" /> {t('create')}
            </Button>
          </div>
        </form>
      </div>

      {initial.length === 0 && (
        <EmptyState emoji="🏫" title={t('emptyTitle')} text={t('emptyText')} />
      )}

      {teaching.length > 0 && (
        <section aria-labelledby="teaching">
          <h2 id="teaching" className="mb-3 text-2xl font-extrabold">
            👩‍🏫 {t('teaching')}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {teaching.map((c) => (
              <li key={c.id}>
                <Link href={`/clases/${c.id}`} className={card}>
                  <span className="text-xl font-extrabold">{c.name}</span>
                  <span className="text-sm text-muted">
                    <Users className="mr-1 inline size-4" />
                    {t('studentsCount', { count: c.students })} ·{' '}
                    {t('assignmentsCount', { count: c.assignments })}
                  </span>
                  <span className="mt-2 self-start rounded-xl bg-surface-2 px-3 py-1 font-display font-black tracking-widest">
                    {c.joinCode}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {learning.length > 0 && (
        <section aria-labelledby="learning">
          <h2 id="learning" className="mb-3 text-2xl font-extrabold">
            🎒 {t('learning')}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {learning.map((c) => (
              <li key={c.id}>
                <Link href={`/clases/${c.id}`} className={card}>
                  <span className="text-xl font-extrabold">{c.name}</span>
                  <span className="text-sm text-muted">
                    {t('teacherIs', { name: c.teacher })} ·{' '}
                    {t('assignmentsCount', { count: c.assignments })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
