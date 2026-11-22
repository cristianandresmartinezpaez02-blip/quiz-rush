'use client';
// Lista de "Mis quizzes": crear, abrir, borrar y paginación por cursor.
import { AnimatePresence, motion } from 'motion/react';
import {
  Eye,
  FileDown,
  FileUp,
  LayoutTemplate,
  MoreVertical,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getTheme } from '@quiz-rush/shared';
import { ImportDialog } from '@/components/create/import-dialog';
import { TemplatesDialog } from '@/components/create/templates-dialog';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';

export interface MyQuizItem {
  id: string;
  title: string;
  coverUrl: string | null;
  theme: string;
  status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
  questionCount: number;
  playCount: number;
  hasUnpublishedChanges: boolean;
  draftUpdatedAt: string;
}

export function MyQuizzes({
  initialItems,
  initialCursor,
  autoCreate,
}: {
  initialItems: MyQuizItem[];
  initialCursor: string | null;
  autoCreate: boolean;
}) {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [creating, setCreating] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const autoCreated = useRef(false);
  const [dialog, setDialog] = useState<null | 'import' | 'templates'>(null);

  async function createQuiz() {
    setCreating(true);
    try {
      const res = await fetch('/api/quizzes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ language: locale === 'en' ? 'en' : 'es' }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const { id } = (await res.json()) as { id: string };
      router.push(`/crear/${id}`);
    } catch {
      toast.error(tc('retry'));
      setCreating(false);
    }
  }

  // "Crear quiz" desde la portada llega con ?nuevo=1: se crea al entrar
  useEffect(() => {
    if (autoCreate && !autoCreated.current) {
      autoCreated.current = true;
      router.replace('/mis-quizzes');
      void createQuiz();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCreate]);

  /** Organiza una partida en vivo con un quiz publicado. */
  async function host(quizId: string) {
    const res = await fetch('/api/games', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quizId }),
    });
    if (!res.ok) return toast.error(tc('retry'));
    const { gameId } = (await res.json()) as { gameId: string };
    router.push(`/host/${gameId}`);
  }

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/quizzes?cursor=${encodeURIComponent(cursor)}`);
      const data = (await res.json()) as { items: MyQuizItem[]; nextCursor: string | null };
      setItems((prev) => [...prev, ...data.items]);
      setCursor(data.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  async function remove(item: MyQuizItem) {
    if (!confirm(t('deleteConfirm', { title: item.title || t('untitled') }))) return;
    const prev = items;
    setItems((list) => list.filter((q) => q.id !== item.id)); // optimista
    const res = await fetch(`/api/quizzes/${item.id}`, { method: 'DELETE' });
    if (res.ok) toast.success(t('deleted'));
    else {
      setItems(prev);
      toast.error(tc('retry'));
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap gap-2">
        <Button size="lg" onClick={createQuiz} loading={creating}>
          <Plus className="size-5" strokeWidth={3} /> {creating ? t('creating') : t('new')}
        </Button>
        <Button asChild size="lg" variant="accent">
          <Link href="/crear/ia">
            <Sparkles className="size-5" /> {t('generateAi')}
          </Link>
        </Button>
        <Button size="lg" variant="outline" onClick={() => setDialog('templates')}>
          <LayoutTemplate className="size-5" /> {t('fromTemplate')}
        </Button>
        <Button size="lg" variant="outline" onClick={() => setDialog('import')}>
          <FileUp className="size-5" /> {t('importFile')}
        </Button>
      </div>
      <ImportDialog open={dialog === 'import'} onClose={() => setDialog(null)} />
      <TemplatesDialog open={dialog === 'templates'} onClose={() => setDialog(null)} />

      {items.length === 0 ? (
        <EmptyState
          emoji="🚀"
          title={t('emptyTitle')}
          text={t('emptyText')}
          action={
            <Button size="lg" variant="accent" onClick={createQuiz} loading={creating}>
              ⚡ {t('new')}
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <AnimatePresence initial={false}>
            {items.map((q, i) => (
              <motion.li
                key={q.id}
                layout
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 8) * 0.03 } }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <QuizCard item={q} onDelete={() => remove(q)} onHost={() => host(q.id)} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {cursor && (
        <div className="mt-8 text-center">
          <Button variant="outline" onClick={loadMore} loading={loadingMore}>
            {t('loadMore')}
          </Button>
        </div>
      )}
    </>
  );
}

function QuizCard({
  item,
  onDelete,
  onHost,
}: {
  item: MyQuizItem;
  onDelete: () => void;
  onHost: () => void;
}) {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const format = useFormatter();
  const theme = getTheme(item.theme);
  const [menu, setMenu] = useState(false);

  const statusStyle = {
    DRAFT: 'bg-surface-2 text-muted',
    PUBLISHED: 'bg-success/15 text-success',
    HIDDEN: 'bg-danger/15 text-danger',
  }[item.status];

  return (
    <div className="card group relative overflow-hidden transition-transform hover:-translate-y-1 hover:shadow-[0_8px_0_0_var(--line)]">
      <Link href={`/crear/${item.id}`} className="block">
        <div
          className="relative grid aspect-video place-items-center overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }}
        >
          {item.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <span
              className="text-5xl transition-transform group-hover:scale-110 group-hover:rotate-6"
              aria-hidden="true"
            >
              {theme.emoji}
            </span>
          )}
          <span
            className={cn(
              'absolute top-2 left-2 rounded-full px-2.5 py-1 text-xs font-bold backdrop-blur',
              statusStyle,
            )}
          >
            {t(`status.${item.status}`)}
          </span>
        </div>
        <div className="p-4">
          <h2 className="line-clamp-2 min-h-12 text-lg leading-tight font-extrabold">
            {item.title || <span className="text-muted italic">{t('untitled')}</span>}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {tc('questions', { count: item.questionCount })} ·{' '}
            {t('edited', { date: format.relativeTime(new Date(item.draftUpdatedAt)) })}
          </p>
          {item.hasUnpublishedChanges && (
            <p className="mt-1 text-xs font-bold text-accent">● {t('unpublishedChanges')}</p>
          )}
        </div>
      </Link>
      <div className="absolute top-2 right-2">
        <button
          type="button"
          aria-label={tc('edit')}
          aria-expanded={menu}
          onClick={() => setMenu((m) => !m)}
          className="grid size-8 cursor-pointer place-items-center rounded-lg bg-black/35 text-white backdrop-blur hover:bg-black/55"
        >
          <MoreVertical className="size-4" />
        </button>
        {menu && (
          <div
            className="card absolute right-0 z-10 mt-1 w-52 p-1 shadow-xl"
            onMouseLeave={() => setMenu(false)}
          >
            {item.status === 'PUBLISHED' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(false);
                    onHost();
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-surface-2"
                >
                  <Play className="size-4" /> {t('host')}
                </button>
                <Link
                  href={`/quiz/${item.id}`}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-surface-2"
                >
                  <Eye className="size-4" /> {t('viewPublic')}
                </Link>
              </>
            )}
            <a
              href={`/api/quizzes/${item.id}/export?format=xlsx`}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-surface-2"
            >
              <FileDown className="size-4" /> {t('exportXlsx')}
            </a>
            <a
              href={`/api/quizzes/${item.id}/export?format=csv`}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-surface-2"
            >
              <FileDown className="size-4" /> {t('exportCsv')}
            </a>
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                onDelete();
              }}
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-danger hover:bg-surface-2"
            >
              <Trash2 className="size-4" /> {tc('delete')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
