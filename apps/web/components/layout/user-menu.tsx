'use client';
// Menú desplegable del usuario con navegación por teclado (Esc cierra, foco gestionado).
import { AnimatePresence, motion } from 'motion/react';
import {
  BarChart3,
  Bell,
  Bookmark,
  GraduationCap,
  HeartHandshake,
  LayoutGrid,
  LogOut,
  Settings,
  Shield,
  ShoppingBag,
  Wrench,
  Trophy,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { AvatarArt } from '@/components/avatar/avatar-art';
import { signOut } from '@/lib/auth-client';
import { LocaleSwitcher } from './locale-switcher';
import { ThemeToggle } from './theme-toggle';

interface UserMenuProps {
  displayName: string;
  username: string;
  isGuest: boolean;
  /** Configuración del avatar (null = iniciales) */
  avatar: unknown;
  isAdmin?: boolean;
}

export function UserMenu({ displayName, username, isGuest, avatar, isAdmin }: UserMenuProps) {
  const t = useTranslations('nav');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const item =
    'hover:bg-surface-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid size-10 cursor-pointer place-items-center rounded-full bg-gradient-to-br from-accent to-primary font-display font-extrabold text-primary-ink ring-2 ring-transparent transition hover:ring-accent active:scale-95"
      >
        {avatar ? <AvatarArt config={avatar} size={40} background={false} /> : initials || '⚡'}
        <span className="sr-only">{t('menu')}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            className="card absolute right-0 mt-2 max-h-[calc(100dvh-5rem)] w-60 origin-top-right overflow-y-auto p-2 shadow-2xl"
          >
            <div className="mb-1 border-b-2 border-line px-3 pt-1 pb-2">
              <p className="truncate font-bold">{displayName}</p>
              <p className="truncate text-xs text-muted">{isGuest ? t('guest') : `@${username}`}</p>
            </div>
            {!isGuest && (
              <Link
                role="menuitem"
                href={`/perfil/${username}`}
                className={item}
                onClick={() => setOpen(false)}
              >
                <User className="size-4" /> {t('profile')}
              </Link>
            )}
            {!isGuest && (
              <Link role="menuitem" href="/amigos" className={item} onClick={() => setOpen(false)}>
                <HeartHandshake className="size-4" /> {t('friends')}
              </Link>
            )}
            <Link role="menuitem" href="/clubes" className={item} onClick={() => setOpen(false)}>
              <Shield className="size-4" /> {t('clubs')}
            </Link>
            <Link
              role="menuitem"
              href="/notificaciones"
              className={item}
              onClick={() => setOpen(false)}
            >
              <Bell className="size-4" /> {t('notifications')}
            </Link>
            <Link role="menuitem" href="/progreso" className={item} onClick={() => setOpen(false)}>
              <Trophy className="size-4" /> {t('progress')}
            </Link>
            <Link role="menuitem" href="/clases" className={item} onClick={() => setOpen(false)}>
              <GraduationCap className="size-4" /> {t('classes')}
            </Link>
            <Link role="menuitem" href="/informes" className={item} onClick={() => setOpen(false)}>
              <BarChart3 className="size-4" /> {t('reports')}
            </Link>
            <Link role="menuitem" href="/tienda" className={item} onClick={() => setOpen(false)}>
              <ShoppingBag className="size-4" /> {t('shop')}
            </Link>
            <Link
              role="menuitem"
              href="/mis-quizzes"
              className={item}
              onClick={() => setOpen(false)}
            >
              <LayoutGrid className="size-4" /> {t('myQuizzes')}
            </Link>
            <Link role="menuitem" href="/guardados" className={item} onClick={() => setOpen(false)}>
              <Bookmark className="size-4" /> {t('saved')}
            </Link>
            <Link role="menuitem" href="/ajustes" className={item} onClick={() => setOpen(false)}>
              <Settings className="size-4" /> {t('settings')}
            </Link>
            {isAdmin && (
              <Link role="menuitem" href="/admin" className={item} onClick={() => setOpen(false)}>
                <Wrench className="size-4" /> {t('admin')}
              </Link>
            )}
            <div className="flex items-center gap-1 border-t-2 border-line px-2 pt-2 sm:hidden">
              <LocaleSwitcher />
              <ThemeToggle />
            </div>
            <button
              role="menuitem"
              type="button"
              className={`${item} w-full cursor-pointer text-danger`}
              onClick={async () => {
                // Desconectarse también para los amigos (presencia)
                await fetch('/api/presence', { method: 'DELETE' }).catch(() => {});
                await signOut();
                setOpen(false);
                router.push('/');
                router.refresh();
              }}
            >
              <LogOut className="size-4" /> {t('signOut')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
