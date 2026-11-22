'use client';
// Modal accesible basado en <dialog> nativo: foco atrapado, cierre con Esc y animación de entrada.
import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  className?: string;
  /** Si es false, no se puede cerrar con Esc ni con clic fuera (decisiones obligatorias) */
  dismissible?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  dismissible = true,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const t = useTranslations('common');

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        // Clic en el fondo (fuera del contenido) cierra el modal
        if (dismissible && e.target === ref.current) onClose();
      }}
      className={cn(
        'card m-auto w-[min(92vw,34rem)] p-0 text-fg backdrop:bg-black/60 backdrop:backdrop-blur-sm',
        'open:animate-[modal-in_180ms_ease-out]',
        className,
      )}
    >
      {open && (
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-xl font-extrabold">{title}</h2>
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label={t('close')}
                className="-m-1 cursor-pointer rounded-lg p-1 hover:bg-surface-2"
              >
                <X className="size-5" />
              </button>
            )}
          </div>
          {children}
        </div>
      )}
      <style>{`@keyframes modal-in { from { opacity: 0; transform: translateY(12px) scale(.97) } to { opacity: 1; transform: none } }`}</style>
    </dialog>
  );
}
