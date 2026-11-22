'use client';
// Slot mínimo: pasa las props (className, ref, eventos) al único hijo.
// Permite <Button asChild><Link href="…" /></Button> sin anidar un <button> dentro de un <a>.
import {
  cloneElement,
  forwardRef,
  isValidElement,
  type HTMLAttributes,
  type ReactElement,
} from 'react';
import { cn } from '@/lib/utils';

export const Slot = forwardRef<HTMLElement, HTMLAttributes<HTMLElement> & { disabled?: boolean }>(
  // `disabled` no se reenvía: un <a> no lo admite
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function Slot({ children, className, disabled: _disabled, ...props }, ref) {
    if (!isValidElement(children)) return null;
    const child = children as ReactElement<HTMLAttributes<HTMLElement> & { ref?: unknown }>;
    return cloneElement(child, {
      ...props,
      ...child.props,
      className: cn(className, child.props.className),
      ref,
    } as HTMLAttributes<HTMLElement>);
  },
);
