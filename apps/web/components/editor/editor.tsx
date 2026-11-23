'use client';
// Editor visual estilo diapositivas:
//   izquierda → lista de preguntas (arrastrar para reordenar)
//   centro    → vista previa en vivo, editable, tal como la verá el jugador
//   derecha   → ajustes de la pregunta y del quiz
import { ArrowLeft, Eye, History, PencilLine } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { stableStringify, validateQuiz } from '@quiz-rush/shared';
import { LogoMark } from '@/components/ui/logo';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { clearBackup, readBackup, useAutosave } from '@/hooks/use-autosave';
import { useEditorStore, type ServerQuizState } from '@/stores/editor-store';
import { cn } from '@/lib/utils';
import { ConflictDialog } from './conflict-dialog';
import { PublishStatus } from './publish-status';
import { QuestionCanvas } from './question-canvas';
import { QuestionList } from './question-list';
import { SaveIndicator } from './save-indicator';
import { SettingsPanel } from './settings-panel';
import { VersionHistory } from './version-history';

export function Editor({ initial }: { initial: ServerQuizState }) {
  const t = useTranslations('editor');
  const ready = useEditorStore((s) => s.quizId === initial.id);
  const title = useEditorStore((s) => s.doc.title);
  const doc = useEditorStore((s) => s.doc);
  const updateSettings = useEditorStore((s) => s.updateSettings);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [playerView, setPlayerView] = useState(false);
  const initialized = useRef(false);

  const { forceSave } = useAutosave({ justPublished: t('publish.justPublished') });

  // Inicialización: si hay cambios locales sin guardar de esta misma revisión, se recuperan
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const backup = readBackup(initial.id);
    const recoverable =
      backup &&
      backup.baseRevision === initial.revision &&
      stableStringify(backup.doc) !== stableStringify(initial.doc);
    useEditorStore.getState().init(initial, recoverable ? backup.doc : undefined);
    if (recoverable) toast.info(t('recovered'));
    else if (backup) clearBackup(initial.id);
    // Un quiz COMPLETO que sigue en borrador (creado con IA, desde una plantilla o importado, y
    // aún sin tocar) se publica ya: el autoguardado solo se activa con ediciones.
    const st = useEditorStore.getState();
    if (st.status === 'DRAFT' && validateQuiz(st.doc).length === 0) st.requestSave();
  }, [initial, t]);

  const issues = useMemo(() => validateQuiz(doc), [doc]);

  if (!ready) {
    return (
      <div className="bg-rush grid min-h-dvh place-items-center">
        <LogoMark className="size-16 animate-bounce" />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      {/* Barra superior */}
      <header className="flex h-16 shrink-0 items-center gap-2 border-b-2 border-line bg-surface px-3">
        <Link
          href="/mis-quizzes"
          className="flex items-center gap-1 rounded-xl px-2 py-2 text-sm font-bold hover:bg-surface-2"
          aria-label={t('back')}
        >
          <ArrowLeft className="size-5" />
          <LogoMark className="size-7" />
        </Link>
        <label htmlFor="quiz-title" className="sr-only">
          {t('titlePlaceholder')}
        </label>
        <input
          id="quiz-title"
          value={title}
          onChange={(e) => updateSettings({ title: e.target.value })}
          placeholder={t('titlePlaceholder')}
          maxLength={120}
          className="min-w-0 flex-1 rounded-xl px-3 py-2 font-display text-lg font-extrabold outline-none hover:bg-surface-2 focus:bg-surface-2 md:text-xl"
        />
        <div className="hidden md:block">
          <SaveIndicator />
        </div>
        <PublishStatus issues={issues} />
        <button
          type="button"
          onClick={() => setPlayerView((v) => !v)}
          aria-pressed={playerView}
          title={t('previewLabel')}
          className={cn(
            'hidden h-10 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-bold sm:flex',
            playerView ? 'bg-accent text-accent-ink' : 'hover:bg-surface-2',
          )}
        >
          {playerView ? <PencilLine className="size-4" /> : <Eye className="size-4" />}
          <span className="hidden lg:inline">{playerView ? t('settings') : t('preview')}</span>
        </button>
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="flex h-10 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-bold hover:bg-surface-2"
          title={t('versions')}
        >
          <History className="size-4" />
          <span className="hidden lg:inline">{t('versions')}</span>
        </button>
        <ThemeToggle />
      </header>

      <div className="border-b-2 border-line px-3 py-1.5 md:hidden">
        <SaveIndicator />
      </div>

      {/* Tres paneles (en celular se apilan) */}
      <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr] lg:grid-cols-[17rem_1fr_21rem] lg:grid-rows-1">
        <QuestionList issues={issues} />
        {/* En celular todo es una sola columna con un único scroll; en escritorio, 3 paneles */}
        <div className="flex min-h-0 flex-col overflow-y-auto lg:contents">
          <main id="contenido" className="lg:min-h-0 lg:overflow-y-auto">
            <QuestionCanvas readOnly={playerView} issues={issues} />
          </main>
          <SettingsPanel remixOf={initial.remixOf ?? null} />
        </div>
      </div>

      <VersionHistory open={historyOpen} onClose={() => setHistoryOpen(false)} />
      <ConflictDialog onKeepMine={forceSave} />
    </div>
  );
}
