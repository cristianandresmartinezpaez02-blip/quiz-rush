'use client';
// Lista completa de avisos: "cargar más" por cursor y marcar todo como leído.
import { CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import type { NotificationItem } from '@/components/layout/notifications-bell';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { apiFetch } from '@/lib/client-api';
import {
  NOTIFICATION_ICONS,
  notificationHref,
  notificationText,
  type Translator,
} from '@/lib/notification-text';
import { cn } from '@/lib/utils';

interface Page {
  items: NotificationItem[];
  nextCursor: string | null;
  unread: number;
}

export function NotificationsList({ initial }: { initial: Page }) {
  const t = useTranslations('notifications');
  const ta = useTranslations('achievements');
  const format = useFormatter();
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [unread, setUnread] = useState(initial.unread);
  const [busy, setBusy] = useState(false);

  async function more() {
    if (!cursor) return;
    setBusy(true);
    try {
      const page = await apiFetch<Page>(`/api/notifications?cursor=${cursor}`);
      setItems((x) => [...x, ...page.items]);
      setCursor(page.nextCursor);
    } finally {
      setBusy(false);
    }
  }

  async function readAll() {
    await apiFetch('/api/notifications', { method: 'POST', body: {} });
    const now = new Date().toISOString();
    setItems((x) => x.map((n) => ({ ...n, readAt: n.readAt ?? now })));
    setUnread(0);
  }

  if (!items.length) return <EmptyState emoji="🔔" title={t('empty')} text={t('emptyText')} />;

  return (
    <section aria-labelledby="notif-list" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="notif-list" className="text-lg font-extrabold">
          {unread ? t('labelUnread', { count: unread }) : t('allRead')}
        </h2>
        {unread > 0 && (
          <Button size="sm" variant="ghost" onClick={() => void readAll()}>
            <CheckCheck className="size-4" /> {t('markAllRead')}
          </Button>
        )}
      </div>
      <ul className="card divide-y-2 divide-line overflow-hidden">
        {items.map((n) => (
          <li key={n.id}>
            <Link
              href={notificationHref(n)}
              className={cn('flex gap-3 px-4 py-3 hover:bg-surface-2', !n.readAt && 'bg-accent/5')}
            >
              <span className="text-2xl" aria-hidden="true">
                {NOTIFICATION_ICONS[n.type] ?? '🔔'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block">
                  {notificationText(t as unknown as Translator, ta as unknown as Translator, n)}
                </span>
                <span className="text-xs text-muted">
                  {format.dateTime(new Date(n.createdAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </span>
              {!n.readAt && (
                <span className="mt-2 size-2.5 shrink-0 rounded-full bg-accent">
                  <span className="sr-only">{t('unread')}</span>
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {cursor && (
        <Button
          variant="outline"
          className="self-center"
          loading={busy}
          onClick={() => void more()}
        >
          {t('loadMore')}
        </Button>
      )}
    </section>
  );
}
