// Estado del editor de quizzes (Zustand + Immer).
//
// Cada edición incrementa `changeSeq`. El autoguardado compara `changeSeq` con `savedSeq`
// (la última edición confirmada por el servidor) para saber si hay cambios pendientes.
import { current } from 'immer';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  changeQuestionType,
  createQuestion,
  duplicateQuestion,
  LIMITS,
  type QuestionDoc,
  type QuestionType,
  type QuizDoc,
  type QuizSettings,
} from '@quiz-rush/shared';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'offline' | 'conflict';
export type QuizStatus = 'DRAFT' | 'PUBLISHED' | 'HIDDEN';

export interface ServerQuizState {
  id: string;
  slug: string;
  revision: number;
  status: QuizStatus;
  publishedAt: string | null;
  hasUnpublishedChanges: boolean;
  savedAt: string;
  doc: QuizDoc;
  /** Crédito al quiz original (si es un remix) */
  remixOf?: { id: string; title: string; username: string } | null;
}

export interface SaveResult {
  revision: number;
  status: QuizStatus;
  slug: string;
  publishedAt: string | null;
  hasUnpublishedChanges: boolean;
  savedAt: string;
  justPublished: boolean;
}

interface EditorState {
  quizId: string;
  doc: QuizDoc;
  serverRevision: number;
  status: QuizStatus;
  slug: string;
  publishedAt: string | null;
  hasUnpublishedChanges: boolean;
  lastSavedAt: string | null;
  selectedId: string | null;
  changeSeq: number;
  savedSeq: number;
  saveState: SaveState;
  conflict: { revision: number; doc: QuizDoc } | null;

  init: (server: ServerQuizState, restoredDoc?: QuizDoc) => void;
  select: (id: string | null) => void;
  updateSettings: (patch: Partial<QuizSettings>) => void;
  addQuestion: (type: QuestionType, afterId?: string) => void;
  removeQuestion: (id: string) => void;
  duplicate: (id: string) => void;
  moveQuestion: (from: number, to: number) => void;
  updateQuestion: (id: string, recipe: (q: QuestionDoc) => void) => void;
  changeType: (id: string, type: QuestionType) => void;

  markSaving: () => void;
  markSaved: (seq: number, result: SaveResult) => void;
  markError: (offline: boolean) => void;
  setConflict: (conflict: { revision: number; doc: QuizDoc }) => void;
  /** El servidor ya tenía nuestro contenido con otra revisión: adoptarla sin conflicto */
  rebase: (revision: number, seq: number) => void;
  /** Aceptar la versión del servidor: descarta los cambios locales */
  acceptServer: (revision: number, doc: QuizDoc, savedAt?: string) => void;
}

export const useEditorStore = create<EditorState>()(
  immer((set) => {
    /** Marca el documento como modificado (lo llaman todas las ediciones). */
    const touch = (s: EditorState) => {
      s.changeSeq += 1;
      if (s.saveState !== 'conflict') s.saveState = 'dirty';
    };

    return {
      quizId: '',
      doc: {
        title: '',
        language: 'es',
        difficulty: 'MEDIUM',
        theme: 'space',
        tags: [],
        questions: [],
      },
      serverRevision: 0,
      status: 'DRAFT',
      slug: '',
      publishedAt: null,
      hasUnpublishedChanges: false,
      lastSavedAt: null,
      selectedId: null,
      changeSeq: 0,
      savedSeq: 0,
      saveState: 'saved',
      conflict: null,

      init: (server, restoredDoc) =>
        set((s) => {
          s.quizId = server.id;
          s.doc = restoredDoc ?? server.doc;
          s.serverRevision = server.revision;
          s.status = server.status;
          s.slug = server.slug;
          s.publishedAt = server.publishedAt;
          s.hasUnpublishedChanges = server.hasUnpublishedChanges;
          s.lastSavedAt = server.savedAt;
          s.selectedId = (restoredDoc ?? server.doc).questions[0]?.id ?? null;
          s.conflict = null;
          // Si recuperamos cambios locales, quedan pendientes de guardar
          s.changeSeq = restoredDoc ? 1 : 0;
          s.savedSeq = 0;
          s.saveState = restoredDoc ? 'dirty' : 'saved';
        }),

      select: (id) => set((s) => void (s.selectedId = id)),

      updateSettings: (patch) =>
        set((s) => {
          Object.assign(s.doc, patch);
          touch(s);
        }),

      addQuestion: (type, afterId) =>
        set((s) => {
          if (s.doc.questions.length >= LIMITS.questionsPerQuiz.max) return;
          const q = createQuestion(type, s.doc.language);
          const index = afterId ? s.doc.questions.findIndex((x) => x.id === afterId) : -1;
          if (index >= 0) s.doc.questions.splice(index + 1, 0, q);
          else s.doc.questions.push(q);
          s.selectedId = q.id;
          touch(s);
        }),

      removeQuestion: (id) =>
        set((s) => {
          const index = s.doc.questions.findIndex((q) => q.id === id);
          if (index < 0) return;
          s.doc.questions.splice(index, 1);
          if (s.selectedId === id) {
            s.selectedId = s.doc.questions[Math.min(index, s.doc.questions.length - 1)]?.id ?? null;
          }
          touch(s);
        }),

      duplicate: (id) =>
        set((s) => {
          if (s.doc.questions.length >= LIMITS.questionsPerQuiz.max) return;
          const index = s.doc.questions.findIndex((q) => q.id === id);
          if (index < 0) return;
          // current(): copia plana del borrador de Immer (structuredClone no admite Proxies)
          const copy = duplicateQuestion(current(s.doc.questions[index]) as QuestionDoc);
          s.doc.questions.splice(index + 1, 0, copy);
          s.selectedId = copy.id;
          touch(s);
        }),

      moveQuestion: (from, to) =>
        set((s) => {
          if (from === to) return;
          const [moved] = s.doc.questions.splice(from, 1);
          if (moved) s.doc.questions.splice(to, 0, moved);
          touch(s);
        }),

      updateQuestion: (id, recipe) =>
        set((s) => {
          const q = s.doc.questions.find((x) => x.id === id);
          if (!q) return;
          recipe(q);
          touch(s);
        }),

      changeType: (id, type) =>
        set((s) => {
          const index = s.doc.questions.findIndex((q) => q.id === id);
          if (index < 0) return;
          s.doc.questions[index] = changeQuestionType(
            current(s.doc.questions[index]) as QuestionDoc,
            type,
            s.doc.language,
          );
          touch(s);
        }),

      markSaving: () => set((s) => void (s.saveState = 'saving')),

      markSaved: (seq, result) =>
        set((s) => {
          s.savedSeq = Math.max(s.savedSeq, seq);
          s.serverRevision = result.revision;
          s.status = result.status;
          s.slug = result.slug;
          s.publishedAt = result.publishedAt;
          s.hasUnpublishedChanges = result.hasUnpublishedChanges;
          s.lastSavedAt = result.savedAt;
          s.conflict = null;
          // Si el usuario siguió editando mientras se guardaba, sigue habiendo cambios
          s.saveState = s.changeSeq > s.savedSeq ? 'dirty' : 'saved';
        }),

      markError: (offline) => set((s) => void (s.saveState = offline ? 'offline' : 'error')),

      setConflict: (conflict) =>
        set((s) => {
          s.conflict = conflict;
          s.saveState = 'conflict';
        }),

      rebase: (revision, seq) =>
        set((s) => {
          s.serverRevision = revision;
          s.savedSeq = Math.max(s.savedSeq, seq);
          s.saveState = s.changeSeq > s.savedSeq ? 'dirty' : 'saved';
        }),

      acceptServer: (revision, doc, savedAt) =>
        set((s) => {
          s.doc = doc;
          s.serverRevision = revision;
          s.conflict = null;
          s.savedSeq = s.changeSeq;
          s.saveState = 'saved';
          if (savedAt) s.lastSavedAt = savedAt;
          if (!doc.questions.some((q) => q.id === s.selectedId)) {
            s.selectedId = doc.questions[0]?.id ?? null;
          }
        }),
    };
  }),
);

/** Pregunta seleccionada (o null). */
export const useSelectedQuestion = () =>
  useEditorStore((s) => s.doc.questions.find((q) => q.id === s.selectedId) ?? null);
