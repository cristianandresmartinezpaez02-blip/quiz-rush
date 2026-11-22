// Logo de Quiz_Rush: rayo inclinado dentro de un escudo + nombre con el guion bajo como chispa.
import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn('size-9', className)} aria-hidden="true">
      <defs>
        <linearGradient id="qr-bolt" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFE14D" />
          <stop offset="1" stopColor="#FFB020" />
        </linearGradient>
        <linearGradient id="qr-badge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF3D9A" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <rect
        x="3"
        y="3"
        width="42"
        height="42"
        rx="13"
        fill="url(#qr-badge)"
        transform="rotate(-6 24 24)"
      />
      <path
        d="M27.5 7 13 27h9.2L19 41l16-21.5h-9.4L27.5 7Z"
        fill="url(#qr-bolt)"
        stroke="#1A1640"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 font-display text-xl font-extrabold',
        className,
      )}
    >
      <LogoMark />
      <span className="logo-word tracking-tight whitespace-nowrap">
        Quiz
        {/* El guion bajo es una "chispa" magenta que parpadea */}
        <span
          className="mx-[0.08em] inline-block h-[0.16em] w-[0.5em] animate-spark rounded-full bg-accent align-baseline"
          aria-hidden="true"
        />
        <span className="sr-only">_</span>
        Rush
      </span>
    </span>
  );
}
