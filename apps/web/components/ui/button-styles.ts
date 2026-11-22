// Estilos del botón "tecla arcade", sin 'use client': así las páginas de servidor pueden dar
// aspecto de botón a un <a> (p. ej. descargas) sin pasar elementos a un componente cliente.
import { cn } from '@/lib/utils';

export const buttonVariants = {
  primary:
    'bg-primary text-primary-ink shadow-[0_5px_0_0_var(--primary-shadow)] hover:brightness-105',
  accent: 'bg-accent text-accent-ink shadow-[0_5px_0_0_var(--accent-shadow)] hover:brightness-110',
  outline:
    'bg-surface text-fg border-2 border-line shadow-[0_4px_0_0_var(--line)] hover:border-accent/60',
  ghost: 'bg-transparent text-fg hover:bg-surface-2 shadow-none',
  danger:
    'bg-danger text-danger-ink shadow-[0_5px_0_0_color-mix(in_oklab,var(--danger)_60%,black)]',
} as const;

export const buttonSizes = {
  sm: 'h-9 px-3 text-sm rounded-xl gap-1.5',
  md: 'h-11 px-5 text-base rounded-2xl gap-2',
  lg: 'h-14 px-7 text-lg rounded-[1.25rem] gap-2.5',
  icon: 'h-10 w-10 rounded-xl',
} as const;

export function buttonClass(
  variant: keyof typeof buttonVariants = 'primary',
  size: keyof typeof buttonSizes = 'md',
  className?: string,
) {
  return cn(
    'inline-flex shrink-0 cursor-pointer items-center justify-center font-display font-bold whitespace-nowrap transition-all duration-100 select-none',
    'disabled:pointer-events-none disabled:opacity-50',
    variant !== 'ghost' && 'active:translate-y-[4px] active:shadow-none',
    buttonVariants[variant],
    buttonSizes[size],
    className,
  );
}
