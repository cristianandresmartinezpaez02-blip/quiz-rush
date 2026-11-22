'use client';
// Reintenta en cuanto vuelve la conexión (y también con el botón).
import { RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export function RetryButton({ label }: { label: string }) {
  useEffect(() => {
    const back = () => window.location.reload();
    window.addEventListener('online', back);
    return () => window.removeEventListener('online', back);
  }, []);
  return (
    <Button size="lg" onClick={() => window.location.reload()}>
      <RefreshCw className="size-5" /> {label}
    </Button>
  );
}
