'use client';
// Barra de navegación inferior para el celular (botones grandes, estilo app). El inicio está en
// el logo de arriba; aquí va Clases, para que los estudiantes se unan a la de su profe.
import { motion } from 'motion/react';
import { Gamepad2, GraduationCap, Library, PlusCircle, Zap } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export function MobileNav() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const items = [
    {
      href: '/biblioteca',
      icon: Library,
      label: t('library'),
      match: (p: string) => p.startsWith('/biblioteca') || p.startsWith('/quiz'),
    },
    {
      href: '/jugar',
      icon: Gamepad2,
      label: t('play'),
      match: (p: string) => p.startsWith('/jugar'),
    },
    {
      href: '/clases',
      icon: GraduationCap,
      label: t('classes'),
      match: (p: string) => p.startsWith('/clases') || p.startsWith('/certificado'),
    },
    {
      href: '/mis-quizzes',
      icon: PlusCircle,
      label: t('create'),
      match: (p: string) => p.startsWith('/mis-quizzes'),
    },
    {
      href: '/solo',
      icon: Zap,
      label: t('solo'),
      match: (p: string) =>
        ['/solo', '/duelo', '/aventura', '/reto-diario', '/desafio', '/progreso', '/tienda'].some(
          (x) => p.startsWith(x),
        ),
    },
  ];

  return (
    <nav
      aria-label={t('menu')}
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map(({ href, icon: Icon, label, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-extrabold',
                  active ? 'text-accent' : 'text-muted',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="mobile-nav-active"
                    className="absolute top-0 h-1 w-10 rounded-b-full bg-accent"
                  />
                )}
                <Icon className="size-6" strokeWidth={active ? 2.6 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
