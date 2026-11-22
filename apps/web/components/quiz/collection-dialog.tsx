'use client';
// Guardar un quiz en colecciones: marcar/desmarcar colecciones existentes o crear una nueva.
import { Check, FolderPlus, Lock, Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';

interface CollectionItem {
  id: string;
  name: string;
  isPublic: boolean;
  itemCount: number;
}

export function CollectionDialog({
  open,
  onClose,
  quizId,
  initialSelected,
  onSelectedChange,
}: {
  open: boolean;
  onClose: () => void;
  quizId: string;
  initialSelected: string[];
  onSelectedChange: (ids: string[]) => void;
}) {
  const t = useTranslations('quiz');
  const [collections, setCollections] = useState<CollectionItem[] | null>(null);
  const [selected, setSelected] = useState(new Set(initialSelected));
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch('/api/collections')
      .then((r) => (r.ok ? (r.json() as Promise<{ items: CollectionItem[] }>) : null))
      .then((d) => {
        if (!cancelled && d) setCollections(d.items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function toggle(id: string) {
    const on = !selected.has(id);
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next); // optimista
    const res = await fetch(`/api/collections/${id}/items`, {
      method: on ? 'POST' : 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quizId }),
    });
    if (!res.ok) {
      setSelected(selected);
      toast.error(t('actionError'));
      return;
    }
    onSelectedChange([...next]);
    setCollections(
      (list) =>
        list?.map((c) => (c.id === id ? { ...c, itemCount: c.itemCount + (on ? 1 : -1) } : c)) ??
        null,
    );
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.status === 400) {
        toast.error(t('collectionNameInvalid'));
        return;
      }
      if (!res.ok) throw new Error();
      const created = (await res.json()) as { id: string; name: string; isPublic: boolean };
      setCollections((list) => [{ ...created, itemCount: 0 }, ...(list ?? [])]);
      setName('');
      await toggle(created.id); // y se guarda el quiz en la colección recién creada
    } catch {
      toast.error(t('actionError'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('saveToCollection')}>
      <form onSubmit={create} className="mb-4 flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('newCollectionPlaceholder')}
          maxLength={60}
          aria-label={t('newCollectionPlaceholder')}
        />
        <Button type="submit" loading={creating} disabled={!name.trim()}>
          <FolderPlus className="size-4" />
        </Button>
      </form>
      {collections === null ? (
        <p className="py-4 text-center text-sm text-muted">…</p>
      ) : collections.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">{t('noCollections')}</p>
      ) : (
        <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
          {collections.map((c) => {
            const on = selected.has(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(c.id)}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-left',
                    on ? 'border-accent bg-accent/10' : 'border-line hover:border-accent/50',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-6 place-items-center rounded-lg border-2',
                      on ? 'border-accent bg-accent text-accent-ink' : 'border-line',
                    )}
                  >
                    {on && <Check className="size-4" strokeWidth={3} />}
                  </span>
                  <span className="flex-1 font-bold">{c.name}</span>
                  <span className="flex items-center gap-1 text-xs text-muted">
                    {c.isPublic ? <Globe className="size-3.5" /> : <Lock className="size-3.5" />}{' '}
                    {c.itemCount}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
