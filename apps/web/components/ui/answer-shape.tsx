// Formas e iconos de las opciones de respuesta.
// Cada opción combina color + forma + icono, para que sea distinguible sin depender del color
// (accesibilidad para daltonismo y pantallas de proyector con mal contraste).
import { Circle, Diamond, Square, Star, Triangle, Zap, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export const ANSWER_STYLES: { icon: LucideIcon; bg: string; ring: string; label: string }[] = [
  { icon: Zap, bg: 'bg-ans-1', ring: 'ring-ans-1', label: 'rayo' },
  { icon: Star, bg: 'bg-ans-2', ring: 'ring-ans-2', label: 'estrella' },
  { icon: Circle, bg: 'bg-ans-3', ring: 'ring-ans-3', label: 'círculo' },
  { icon: Diamond, bg: 'bg-ans-4', ring: 'ring-ans-4', label: 'rombo' },
  { icon: Triangle, bg: 'bg-ans-5', ring: 'ring-ans-5', label: 'triángulo' },
  { icon: Square, bg: 'bg-ans-6', ring: 'ring-ans-6', label: 'cuadrado' },
];

export function answerStyle(index: number) {
  return ANSWER_STYLES[index % ANSWER_STYLES.length]!;
}

export function AnswerIcon({ index, className }: { index: number; className?: string }) {
  const { icon: Icon } = answerStyle(index);
  return (
    <Icon className={cn('size-6 fill-current', className)} strokeWidth={2.5} aria-hidden="true" />
  );
}
