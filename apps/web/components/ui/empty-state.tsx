// Estado vacío ilustrado con una pequeña animación flotante.
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  emoji?: string;
  title: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ emoji = '⚡', title, text, action, className }: EmptyStateProps) {
  return (
    <div className={cn('card flex flex-col items-center gap-3 px-6 py-14 text-center', className)}>
      <div className="relative">
        <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-primary/25 blur-2xl" />
        <span className="block animate-float text-6xl" aria-hidden="true">
          {emoji}
        </span>
      </div>
      <h2 className="mt-2 text-2xl font-extrabold">{title}</h2>
      {text && <p className="max-w-md text-muted">{text}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
