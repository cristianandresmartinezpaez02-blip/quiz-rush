'use client';
// Diálogo de conflicto: el quiz se guardó desde otra pestaña o dispositivo.
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { clearBackup } from '@/hooks/use-autosave';
import { useEditorStore } from '@/stores/editor-store';

export function ConflictDialog({ onKeepMine }: { onKeepMine: () => void }) {
  const t = useTranslations('editor');
  const conflict = useEditorStore((s) => s.conflict);
  const quizId = useEditorStore((s) => s.quizId);

  return (
    <Modal open={!!conflict} onClose={() => {}} dismissible={false} title={t('conflictTitle')}>
      <p className="mb-6 text-muted">{t('conflictText')}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button className="flex-1" onClick={onKeepMine}>
          {t('conflictKeepMine')}
        </Button>
        <Button
          className="flex-1"
          variant="outline"
          onClick={() => {
            if (!conflict) return;
            clearBackup(quizId);
            useEditorStore.getState().acceptServer(conflict.revision, conflict.doc);
          }}
        >
          {t('conflictUseTheirs')}
        </Button>
      </div>
    </Modal>
  );
}
