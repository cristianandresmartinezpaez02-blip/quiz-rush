'use client';
// Autoguardado del editor: "nunca se pierde nada, aunque se cierre la pestaña".
//
// Tres capas de protección:
//  1. Cada 2 s, si hay cambios, se envían al servidor (PUT /api/quizzes/:id).
//  2. Cada cambio se copia al instante en localStorage (sobrevive a cortes de red y cierres).
//  3. Al ocultar o cerrar la pestaña se hace un último envío con `keepalive`.
// Si otra pestaña guardó entretanto, el servidor responde 409 y se pide al usuario qué hacer.
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { AUTOSAVE_INTERVAL_MS, stableStringify, type QuizDoc } from '@quiz-rush/shared';
import { useEditorStore, type SaveResult } from '@/stores/editor-store';

const backupKey = (quizId: string) => `quizrush:draft:${quizId}`;

export interface DraftBackup {
  baseRevision: number;
  doc: QuizDoc;
  at: number;
}

export function readBackup(quizId: string): DraftBackup | null {
  try {
    const raw = localStorage.getItem(backupKey(quizId));
    return raw ? (JSON.parse(raw) as DraftBackup) : null;
  } catch {
    return null;
  }
}

export function clearBackup(quizId: string) {
  try {
    localStorage.removeItem(backupKey(quizId));
  } catch {
    /* almacenamiento no disponible */
  }
}

function writeBackup(quizId: string, backup: DraftBackup) {
  try {
    localStorage.setItem(backupKey(quizId), JSON.stringify(backup));
  } catch {
    /* cuota excedida o modo privado: el guardado en servidor sigue funcionando */
  }
}

export function useAutosave(messages: { justPublished: string }) {
  const inFlight = useRef(false);
  const failures = useRef(0);
  const skipTicks = useRef(0);

  // Capa 2: copia local inmediata de cada cambio
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useEditorStore.subscribe((state, prev) => {
      if (state.changeSeq === prev.changeSeq && state.savedSeq === prev.savedSeq) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const s = useEditorStore.getState();
        if (!s.quizId) return;
        if (s.changeSeq > s.savedSeq) {
          writeBackup(s.quizId, { baseRevision: s.serverRevision, doc: s.doc, at: Date.now() });
        } else {
          clearBackup(s.quizId); // todo confirmado por el servidor
        }
      }, 300);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  // Capa 1: guardado periódico en el servidor
  useEffect(() => {
    async function save(force = false) {
      const s = useEditorStore.getState();
      if (inFlight.current || !s.quizId) return;
      if (!force && (s.changeSeq <= s.savedSeq || s.saveState === 'conflict')) return;

      inFlight.current = true;
      const seq = s.changeSeq;
      const sentDoc = s.doc;
      s.markSaving();
      try {
        const res = await fetch(`/api/quizzes/${s.quizId}${force ? '?force=1' : ''}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ baseRevision: s.serverRevision, doc: sentDoc }),
        });
        if (res.status === 409) {
          const body = (await res.json()) as {
            details?: { revision: number; doc: QuizDoc };
          };
          const store = useEditorStore.getState();
          if (!body.details) {
            store.markError(false);
          } else if (stableStringify(body.details.doc) === stableStringify(sentDoc)) {
            // El servidor ya tiene exactamente lo que enviamos (p. ej. un envío "keepalive"
            // previo de esta misma pestaña): no es un conflicto real, solo actualizamos la revisión.
            store.rebase(body.details.revision, seq);
          } else {
            store.setConflict(body.details);
          }
          return;
        }
        if (!res.ok) {
          // 4xx de validación: no reintentar en bucle cada 2 s
          failures.current += 1;
          skipTicks.current = Math.min(2 ** failures.current, 15);
          useEditorStore.getState().markError(false);
          return;
        }
        const result = (await res.json()) as SaveResult;
        failures.current = 0;
        useEditorStore.getState().markSaved(seq, result);
        if (result.justPublished) toast.success(messages.justPublished, { duration: 5000 });
      } catch {
        // Sin conexión: reintento con espera progresiva (2 s, 4 s, 8 s… hasta 30 s)
        failures.current += 1;
        skipTicks.current = Math.min(2 ** (failures.current - 1), 15) - 1;
        useEditorStore.getState().markError(true);
      } finally {
        inFlight.current = false;
      }
    }

    const interval = setInterval(() => {
      if (skipTicks.current > 0) {
        skipTicks.current -= 1;
        return;
      }
      void save();
    }, AUTOSAVE_INTERVAL_MS);

    // Al recuperar la conexión, guardar enseguida
    const onOnline = () => {
      skipTicks.current = 0;
      void save();
    };
    window.addEventListener('online', onOnline);

    // Exponer el guardado para el diálogo de conflicto y para el cambio de pestaña
    forceSaveRef.current = () => save(true);
    saveNowRef.current = () => save();

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
    };
  }, [messages.justPublished]);

  // Capa 3: guardar al ocultar la pestaña y último envío "keepalive" al cerrarla
  useEffect(() => {
    // La página se descarga: la petición normal podría cancelarse, por eso usamos keepalive
    const flush = () => {
      const s = useEditorStore.getState();
      if (!s.quizId || s.changeSeq <= s.savedSeq || s.saveState === 'conflict') return;
      writeBackup(s.quizId, { baseRevision: s.serverRevision, doc: s.doc, at: Date.now() });
      const body = JSON.stringify({ baseRevision: s.serverRevision, doc: s.doc });
      // keepalive tiene un límite de 64 KB; si es mayor, la copia local lo cubre
      if (body.length < 60_000) {
        void fetch(`/api/quizzes/${s.quizId}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    };
    // Solo oculta (cambio de pestaña o app): la página sigue viva, basta un guardado normal
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void saveNowRef.current?.();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = useEditorStore.getState();
      if (s.changeSeq > s.savedSeq) {
        flush();
        e.preventDefault();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  return { forceSave: () => forceSaveRef.current?.() };
}

const forceSaveRef: { current: (() => Promise<void>) | null } = { current: null };
const saveNowRef: { current: (() => Promise<void>) | null } = { current: null };
