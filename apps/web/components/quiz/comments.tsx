'use client';
// Comentarios del quiz con respuestas (un nivel), "me gusta", borrar y reportar.
import { AnimatePresence, motion } from 'motion/react';
import { Flag, Heart, MessageCircle, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useAuthGuard, type Viewer } from '@/components/social/use-auth-guard';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CommentView } from '@/lib/community-service';
import { ReportDialog } from './report-dialog';

export function Comments({
  quizId,
  quizAuthorId,
  viewer,
  initialCount,
}: {
  quizId: string;
  quizAuthorId: string;
  viewer: Viewer | null;
  initialCount: number;
}) {
  const t = useTranslations('comments');
  const [items, setItems] = useState<CommentView[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/quizzes/${quizId}/comments`)
      .then((r) =>
        r.ok ? (r.json() as Promise<{ items: CommentView[]; nextCursor: string | null }>) : null,
      )
      .then((d) => {
        if (!cancelled && d) {
          setItems(d.items);
          setCursor(d.nextCursor);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  async function loadMore() {
    if (!cursor) return;
    const res = await fetch(`/api/quizzes/${quizId}/comments?cursor=${cursor}`);
    if (!res.ok) return;
    const d = (await res.json()) as { items: CommentView[]; nextCursor: string | null };
    setItems((prev) => [...(prev ?? []), ...d.items]);
    setCursor(d.nextCursor);
  }

  return (
    <section id="comentarios" aria-labelledby="comments-title" className="scroll-mt-24">
      <h2 id="comments-title" className="mb-4 text-2xl font-extrabold">
        💬 {t('title')} <span className="text-lg text-muted">({count})</span>
      </h2>
      <CommentForm
        quizId={quizId}
        viewer={viewer}
        onPosted={(c) => {
          setItems((prev) => [c, ...(prev ?? [])]);
          setCount((n) => n + 1);
        }}
      />
      {items === null ? (
        <p className="py-6 text-center text-muted">…</p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-muted">{t('empty')}</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          <AnimatePresence initial={false}>
            {items.map((c) => (
              <motion.li
                key={c.id}
                layout
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <CommentItem
                  comment={c}
                  quizId={quizId}
                  quizAuthorId={quizAuthorId}
                  viewer={viewer}
                  onDeleted={(removed) => {
                    setItems((prev) => prev?.filter((x) => x.id !== c.id) ?? null);
                    setCount((n) => n - removed);
                  }}
                  onCountDelta={(delta) => setCount((n) => n + delta)}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {cursor && (
        <div className="mt-6 text-center">
          <Button variant="outline" onClick={loadMore}>
            {t('loadMore')}
          </Button>
        </div>
      )}
    </section>
  );
}

function CommentForm({
  quizId,
  viewer,
  parentId,
  onPosted,
  autoFocus,
  compact,
}: {
  quizId: string;
  viewer: Viewer | null;
  parentId?: string;
  onPosted: (c: CommentView) => void;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const t = useTranslations('comments');
  const guard = useAuthGuard(viewer);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() || !guard(true)) return;
    setSending(true);
    try {
      const res = await fetch(`/api/quizzes/${quizId}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: body.trim(), parentId: parentId ?? null }),
      });
      if (res.status === 400) {
        toast.error(t('offensive'));
        return;
      }
      if (res.status === 429) {
        toast.error(t('tooFast'));
        return;
      }
      if (!res.ok) throw new Error();
      onPosted((await res.json()) as CommentView);
      setBody('');
    } catch {
      toast.error(t('error'));
    } finally {
      setSending(false);
    }
  }

  if (!viewer && !compact) {
    return (
      <p className="card p-4 text-center text-sm text-muted">
        <Link
          href={`/entrar?volver=/quiz/${quizId}%23comentarios`}
          className="font-bold text-accent"
        >
          {t('signInToComment')}
        </Link>
      </p>
    );
  }

  return (
    <form onSubmit={submit} className={cn('flex gap-2', compact ? 'mt-3' : '')}>
      <label className="sr-only" htmlFor={`comment-${parentId ?? 'root'}`}>
        {parentId ? t('replyPlaceholder') : t('placeholder')}
      </label>
      <textarea
        id={`comment-${parentId ?? 'root'}`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onFocus={() => guard(true)}
        maxLength={1000}
        rows={compact ? 1 : 2}
        autoFocus={autoFocus}
        placeholder={parentId ? t('replyPlaceholder') : t('placeholder')}
        className="min-h-11 flex-1 resize-y rounded-2xl border-2 border-line bg-surface px-4 py-2.5 outline-none focus:border-accent"
      />
      <Button type="submit" loading={sending} disabled={!body.trim()} className="self-end">
        {t('send')}
      </Button>
    </form>
  );
}

function CommentItem({
  comment,
  quizId,
  quizAuthorId,
  viewer,
  onDeleted,
  onCountDelta,
  isReply,
}: {
  comment: CommentView;
  quizId: string;
  quizAuthorId: string;
  viewer: Viewer | null;
  /** Este comentario se borró (removedCount = él + sus respuestas) */
  onDeleted: (removedCount: number) => void;
  /** Cambió el número total de comentarios por una respuesta añadida o borrada */
  onCountDelta?: (delta: number) => void;
  isReply?: boolean;
}) {
  const t = useTranslations('comments');
  const format = useFormatter();
  const guard = useAuthGuard(viewer);
  const [liked, setLiked] = useState(comment.likedByMe);
  const [likes, setLikes] = useState(comment.likeCount);
  const [replies, setReplies] = useState<CommentView[] | null>(null);
  const [replyCount, setReplyCount] = useState(comment.replyCount);
  const [replying, setReplying] = useState(false);
  const [reporting, setReporting] = useState(false);
  const canDelete = comment.mine || viewer?.id === quizAuthorId;
  const isQuizAuthor = comment.authorId === quizAuthorId;

  async function like() {
    if (!guard(true)) return;
    const on = !liked;
    setLiked(on);
    setLikes((n) => n + (on ? 1 : -1));
    const res = await fetch(`/api/comments/${comment.id}/like`, { method: on ? 'POST' : 'DELETE' });
    if (!res.ok) {
      setLiked(!on);
      setLikes((n) => n - (on ? 1 : -1));
    }
  }

  async function showReplies() {
    const res = await fetch(`/api/comments/${comment.id}/replies`);
    if (res.ok) setReplies(((await res.json()) as { items: CommentView[] }).items);
  }

  async function remove() {
    if (!confirm(t('deleteConfirm'))) return;
    const res = await fetch(`/api/comments/${comment.id}`, { method: 'DELETE' });
    if (res.ok) onDeleted(1 + (isReply ? 0 : replyCount));
    else toast.error(t('error'));
  }

  return (
    <div className={cn('flex gap-3', isReply && 'mt-3')}>
      <Link
        href={`/perfil/${comment.author.username}`}
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent to-primary font-display text-sm font-extrabold text-primary-ink"
        aria-hidden="true"
        tabIndex={-1}
      >
        {comment.author.displayName.slice(0, 1).toUpperCase()}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl rounded-tl-sm bg-surface-2 px-4 py-2.5">
          <p className="flex flex-wrap items-center gap-x-2 text-sm">
            <Link
              href={`/perfil/${comment.author.username}`}
              className="font-extrabold hover:underline"
            >
              {comment.author.displayName}
            </Link>
            {isQuizAuthor && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-extrabold text-primary-ink uppercase">
                {t('author')}
              </span>
            )}
            <span className="text-xs text-muted">
              {format.relativeTime(new Date(comment.createdAt))}
            </span>
          </p>
          <p className="mt-0.5 break-words whitespace-pre-line">{comment.body}</p>
        </div>
        <div className="mt-1 flex items-center gap-1 text-xs font-bold text-muted">
          <button
            type="button"
            onClick={like}
            aria-pressed={liked}
            className={cn(
              'flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 hover:bg-surface-2',
              liked && 'text-accent',
            )}
          >
            <Heart className={cn('size-3.5', liked && 'fill-current')} /> {likes || ''}
            <span className="sr-only">{t('like')}</span>
          </button>
          {!isReply && (
            <button
              type="button"
              onClick={() => (guard(true) ? setReplying((r) => !r) : undefined)}
              className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 hover:bg-surface-2"
            >
              <MessageCircle className="size-3.5" /> {t('reply')}
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={remove}
              className="cursor-pointer rounded-lg px-2 py-1 hover:bg-surface-2 hover:text-danger"
              aria-label={t('delete')}
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
          {!comment.mine && viewer && (
            <button
              type="button"
              onClick={() => guard(true) && setReporting(true)}
              className="cursor-pointer rounded-lg px-2 py-1 hover:bg-surface-2 hover:text-danger"
              aria-label={t('report')}
            >
              <Flag className="size-3.5" />
            </button>
          )}
        </div>

        {!isReply && replyCount > 0 && replies === null && (
          <button
            type="button"
            onClick={showReplies}
            className="mt-1 cursor-pointer text-xs font-extrabold text-accent"
          >
            ↳ {t('showReplies', { count: replyCount })}
          </button>
        )}
        {replies?.map((r) => (
          <CommentItem
            key={r.id}
            comment={r}
            quizId={quizId}
            quizAuthorId={quizAuthorId}
            viewer={viewer}
            isReply
            onDeleted={() => {
              setReplies((list) => list?.filter((x) => x.id !== r.id) ?? null);
              setReplyCount((n) => n - 1);
              onCountDelta?.(-1);
            }}
          />
        ))}
        {replying && (
          <CommentForm
            quizId={quizId}
            viewer={viewer}
            parentId={comment.id}
            compact
            autoFocus
            onPosted={(c) => {
              setReplies((list) => [...(list ?? []), c]);
              setReplyCount((n) => n + 1);
              setReplying(false);
              onCountDelta?.(1);
            }}
          />
        )}
      </div>
      <ReportDialog
        open={reporting}
        onClose={() => setReporting(false)}
        targetType="COMMENT"
        targetId={comment.id}
      />
    </div>
  );
}
