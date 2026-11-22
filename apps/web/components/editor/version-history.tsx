'use client';
// Historial de versiones: ver la lista, guardar una versión manual y restaurar una anterior.
import { RotateCcw, Save } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { clearBackup } from '@/hooks/use-autosave';
import { useEditorStore, type ServerQuizState } from '@/stores/editor-store';

interface VersionItem {
  id: string;
  number: number;
  reason: 'AUTO' | 'PUBLISH' | 'RESTORE' | 'MANUAL';
  title: string;
  questionCount: number;
  createdAt: string;
}

export function VersionHistory({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('editor');
  const tc = useTranslations('common');
  const format = useFormatter();
  const quizId = useEditorStore((s) => s.quizId);
  const [items, setItems] = useState<VersionItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Carga la lista al abrir (y tras guardar una versión)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/quizzes/${quizId}/versions`)
      .then((res) => (res.ok ? (res.json() as Promise<{ items: VersionItem[] }>) : null))
      .then((data) => {
        if (!cancelled && data) setItems(data.items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, quizId, reloadKey]);

  async function saveVersion() {
    setBusy('manual');
    // Primero se asegura de que lo último esté guardado
    await waitForSave();
    const res = await fetch(`/api/quizzes/${quizId}/versions`, { method: 'POST' });
    setBusy(null);
    if (res.ok) {
      toast.success(t('versionSaved'));
      setReloadKey((k) => k + 1);
    } else toast.error(tc('retry'));
  }

  async function restore(v: VersionItem) {
    if (!confirm(t('restoreConfirm', { n: v.number }))) return;
    setBusy(v.id);
    await waitForSave();
    const res = await fetch(`/api/quizzes/${quizId}/versions/${v.id}`, { method: 'POST' });
    setBusy(null);
    if (!res.ok) {
      toast.error(tc('retry'));
      return;
    }
    const state = (await res.json()) as ServerQuizState;
    clearBackup(quizId);
    useEditorStore.getState().init(state);
    toast.success(t('restored'));
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t('historyTitle')}>
      <Button
        variant="outline"
        size="sm"
        onClick={saveVersion}
        loading={busy === 'manual'}
        className="mb-4"
      >
        <Save className="size-4" /> {t('saveVersion')}
      </Button>
      {items === null ? (
        <p className="py-6 text-center text-muted">{tc('loading')}</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-muted">{t('historyEmpty')}</p>
      ) : (
        <ol className="flex max-h-[55vh] flex-col gap-2 overflow-y-auto pr-1">
          {items.map((v) => (
            <li key={v.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface font-display font-extrabold">
                v{v.number}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{v.title}</p>
                <p className="text-xs text-muted">
                  {t(`versionReasons.${v.reason}`)} · {tc('questions', { count: v.questionCount })}{' '}
                  · {format.relativeTime(new Date(v.createdAt))}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => restore(v)} loading={busy === v.id}>
                <RotateCcw className="size-4" /> {t('restore')}
              </Button>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

/** Espera (máx. 5 s) a que no haya guardados pendientes antes de operar con versiones. */
async function waitForSave() {
  const start = Date.now();
  while (Date.now() - start < 5000) {
    const s = useEditorStore.getState();
    if (s.changeSeq <= s.savedSeq && s.saveState !== 'saving') return;
    await new Promise((r) => setTimeout(r, 250));
  }
}
