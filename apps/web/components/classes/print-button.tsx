'use client';
// Botón para imprimir o guardar como PDF (se oculta al imprimir).
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PrintButton({ label }: { label: string }) {
  return (
    <Button className="print:hidden" onClick={() => window.print()}>
      <Printer className="size-4" /> {label}
    </Button>
  );
}
