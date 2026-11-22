'use client';
// Campana de notificaciones: contador de no leídas (se consulta cada minuto mientras la
// pestaña está visible, y al instante cuando llega un push) y lista desplegable.
import { AnimatePresence, motion } from 'motion/react';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  NOTIFICATION_ICONS,
  notificationHref,
  notificationText,
  type NotificationData,
  type Translator,
} from '@/lib/notification-text';
import { cn } from '@/lib/utils';

export interface NotificationItem {
  id: string;
  type: string;
  data: NotificationData;
  readAt: string | null;
  createdAt: string;
}

/** Evento que lanza el service worker al recibir un push con la pestaña abierta. */
export const NOTIFICATIONS_CHANGED = 'quizrush:notifications';

export function NotificationsBell() {
  const t = useTranslations('notifications');
  const ta = useTranslations('achievements');
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      const data = (await res.json()) as { items: NotificationItem[]; unread: number };
      setItems(data.items.slice(0, 8));
      setUnread(data.unread);
    } catch {
      /* sin conexión: se reintenta en el siguiente ciclo */
    }
  }, []);

  useEffect(() => {
    const tick = () => document.visibilityState === 'visible' && void load();
    const first = setTimeout(tick, 0);
    const interval = setInterval(tick, 60_000);
    const onPush = () => void load();
    document.addEventListener('visibilitychange', tick);
    window.addEventListener(NOTIFICATIONS_CHANGED, onPush);
    navigator.serviceWorker?.addEventListener('message', onPush);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener(NOTIFICATIONS_CHANGED, onPush);
      navigator.serviceWorker?.removeEventListener('message', onPush);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }).catch(() => {});
    }
  }

  const message = (n: NotificationItem) =>
    notificationText(t as unknown as Translator, ta as unknown as Translator, n);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="relative grid size-10 cursor-pointer place-items-center rounded-xl hover:bg-surface-2"
      >
        <span className="sr-only">{unread ? t('labelUnread', { count: unread }) : t('label')}</span>
        <motion.span
          animate={unread ? { rotate: [0, -14, 12, -8, 0] } : {}}
          transition={{ duration: 0.6 }}
        >
          <Bell className="size-5" />
        </motion.span>
        {unread > 0 && (
          <span
            className="absolute top-1 right-1 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-extrabold text-accent-ink"
            aria-hidden="true"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            className="card absolute right-0 z-50 mt-2 w-[min(22rem,90vw)] origin-top-right overflow-hidden shadow-2xl"
          >
            <p className="border-b-2 border-line px-4 py-3 font-extrabold">{t('title')}</p>
            {!items || items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">🔔 {t('empty')}</p>
            ) : (
              <ul className="max-h-96 overflow-y-auto">
                {items.map((n) => (
                  <li key={n.id}>
                    <Link
                      href={notificationHref(n)}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'flex gap-3 px-4 py-3 text-sm hover:bg-surface-2',
                        !n.readAt && 'bg-accent/5',
                      )}
                    >
                      <span className="text-xl" aria-hidden="true">
                        {NOTIFICATION_ICONS[n.type] ?? '🔔'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block">{message(n)}</span>
                        <span className="text-xs text-muted">
                          {format.relativeTime(new Date(n.createdAt))}
                        </span>
                      </span>
                      {!n.readAt && (
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/notificaciones"
              onClick={() => setOpen(false)}
              className="block border-t-2 border-line px-4 py-3 text-center text-sm font-extrabold text-accent hover:bg-surface-2"
            >
              {t('seeAll')}
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
