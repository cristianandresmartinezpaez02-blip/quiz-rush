// Cabecera global (Server Component): navegación, tema, idioma y menú de usuario.
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { db } from '@quiz-rush/db';
import { RANK_EMOJI, type RankId } from '@quiz-rush/shared';
import { Logo } from '@/components/ui/logo';
import { Button } from '@/components/ui/button';
import { getProgressChip } from '@/lib/progress-service';
import { getCurrentUser } from '@/lib/session';
import { LocaleSwitcher } from './locale-switcher';
import { NotificationsBell } from './notifications-bell';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';

export async function Header() {
  const [t, user] = await Promise.all([getTranslations('nav'), getCurrentUser()]);
  const [chip, avatar] = user
    ? await Promise.all([
        getProgressChip(user.id),
        db.avatar.findUnique({ where: { userId: user.id }, select: { config: true } }),
      ])
    : [null, null];

  return (
    <>
      <header className="sticky top-0 z-40 border-b-2 border-line/70 bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4">
          <Link href="/" className="mr-2 rounded-xl">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
            {[
              { href: '/biblioteca', label: t('library') },
              { href: '/jugar', label: t('play') },
              { href: '/solo', label: t('solo') },
              ...(user ? [{ href: '/clases', label: t('classes') }] : []),
              { href: '/mis-quizzes', label: t('myQuizzes') },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-xl px-3 py-2 text-sm font-bold hover:bg-surface-2"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            {/* En celular, con sesión, idioma y tema van dentro del menú del avatar (no caben aquí) */}
            <span className={user ? 'hidden sm:contents' : 'contents'}>
              <LocaleSwitcher />
              <ThemeToggle />
            </span>
            {chip && (
              <Link
                href="/progreso"
                className="flex shrink-0 items-center gap-2 rounded-xl px-1.5 py-1.5 text-sm font-extrabold hover:bg-surface-2"
                title={t('progress')}
              >
                {/* Nombre accesible como texto oculto (no aria-label): así coincide con lo visible */}
                <span className="sr-only">
                  {t('progressChip', {
                    level: chip.level,
                    coins: chip.coins,
                    streak: chip.dailyStreak,
                  })}
                </span>
                <span className="relative grid size-8 place-items-center" aria-hidden="true">
                  <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
                    <circle
                      cx="18"
                      cy="18"
                      r="15"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="4"
                      opacity="0.15"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="15"
                      fill="none"
                      stroke="var(--primary)"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={`${chip.ratio * 94.2} 94.2`}
                    />
                  </svg>
                  <span className="text-xs">{chip.level}</span>
                </span>
                <span className="hidden items-center gap-1 sm:flex" aria-hidden="true">
                  {RANK_EMOJI[chip.rank as RankId]}
                </span>
                <span
                  className="hidden items-center gap-1 whitespace-nowrap tabular-nums sm:flex"
                  aria-hidden="true"
                >
                  🪙 {chip.coins.toLocaleString()}
                </span>
                {chip.dailyStreak > 0 && (
                  <span
                    className="hidden items-center gap-0.5 tabular-nums lg:flex"
                    aria-hidden="true"
                  >
                    🔥 {chip.dailyStreak}
                  </span>
                )}
              </Link>
            )}
            {user && <NotificationsBell />}
            {user ? (
              <UserMenu
                displayName={user.profile?.displayName ?? user.name}
                username={user.profile?.username ?? ''}
                isGuest={user.isAnonymous}
                avatar={avatar?.config ?? null}
                isAdmin={user.role === 'admin'}
              />
            ) : (
              <>
                {/* En celular solo "Entrar" (más corto): su página enlaza también al registro */}
                <Button asChild size="sm" className="sm:hidden">
                  <Link href="/entrar">{t('signIn')}</Link>
                </Button>
                <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                  <Link href="/entrar">{t('signIn')}</Link>
                </Button>
                <Button asChild size="sm" className="hidden sm:inline-flex">
                  <Link href="/registro">{t('signUp')}</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      {user?.isAnonymous && (
        <div className="border-b-2 border-accent/30 bg-accent/15 px-4 py-2 text-center text-sm">
          <span>{t('guestBanner')}</span>{' '}
          <Link href="/registro" className="font-bold text-accent underline underline-offset-2">
            {t('claimAccount')}
          </Link>
        </div>
      )}
    </>
  );
}
