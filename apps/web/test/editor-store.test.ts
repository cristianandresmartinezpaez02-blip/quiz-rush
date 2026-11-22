import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyQuiz } from '@quiz-rush/shared';
import { useEditorStore, type ServerQuizState } from '@/stores/editor-store';

function server(overrides: Partial<ServerQuizState> = {}): ServerQuizState {
  return {
    id: 'quiz1',
    slug: 'borrador-x',
    revision: 3,
    status: 'DRAFT',
    publishedAt: null,
    hasUnpublishedChanges: false,
    savedAt: new Date().toISOString(),
    doc: createEmptyQuiz('es'),
    ...overrides,
  };
}

const store = () => useEditorStore.getState();

describe('editor-store', () => {
  beforeEach(() => store().init(server()));

  it('se inicializa guardado y con la primera pregunta seleccionada', () => {
    expect(store().saveState).toBe('saved');
    expect(store().selectedId).toBe(store().doc.questions[0]!.id);
    expect(store().serverRevision).toBe(3);
  });

  it('cada edición marca cambios pendientes', () => {
    store().updateSettings({ title: 'Hola' });
    expect(store().changeSeq).toBe(1);
    expect(store().saveState).toBe('dirty');
  });

  it('añade, duplica, reordena y elimina preguntas', () => {
    const first = store().doc.questions[0]!.id;
    store().addQuestion('TRUE_FALSE');
    store().duplicate(first);
    expect(store().doc.questions.map((q) => q.type)).toEqual([
      'MULTIPLE_CHOICE',
      'MULTIPLE_CHOICE',
      'TRUE_FALSE',
    ]);
    store().moveQuestion(2, 0);
    expect(store().doc.questions[0]!.type).toBe('TRUE_FALSE');
    store().removeQuestion(first);
    expect(store().doc.questions).toHaveLength(2);
    expect(store().selectedId).not.toBe(first);
  });

  it('cambiar el tipo conserva el enunciado', () => {
    const id = store().doc.questions[0]!.id;
    store().updateQuestion(id, (q) => void (q.prompt = '¿Pregunta?'));
    store().changeType(id, 'TYPE_ANSWER');
    const q = store().doc.questions[0]!;
    expect(q.type).toBe('TYPE_ANSWER');
    expect(q.prompt).toBe('¿Pregunta?');
    expect(q.config.accepted).toEqual(['']);
  });

  it('si se edita durante un guardado, sigue habiendo cambios tras confirmarlo', () => {
    store().updateSettings({ title: 'A' });
    const seq = store().changeSeq;
    store().markSaving();
    store().updateSettings({ title: 'AB' }); // edición mientras viaja la petición
    store().markSaved(seq, {
      revision: 4,
      status: 'DRAFT',
      slug: 's',
      publishedAt: null,
      hasUnpublishedChanges: false,
      savedAt: '',
      justPublished: false,
    });
    expect(store().saveState).toBe('dirty');
    expect(store().serverRevision).toBe(4);
  });

  it('rebase adopta la revisión del servidor sin conflicto', () => {
    store().updateSettings({ title: 'A' });
    store().rebase(9, store().changeSeq);
    expect(store().serverRevision).toBe(9);
    expect(store().saveState).toBe('saved');
  });

  it('aceptar la versión del servidor resuelve el conflicto', () => {
    store().updateSettings({ title: 'Mío' });
    const theirs = createEmptyQuiz('es');
    theirs.title = 'Suyo';
    store().setConflict({ revision: 7, doc: theirs });
    expect(store().saveState).toBe('conflict');
    store().acceptServer(7, theirs);
    expect(store().doc.title).toBe('Suyo');
    expect(store().saveState).toBe('saved');
    expect(store().conflict).toBeNull();
  });

  it('restaurar cambios locales los deja pendientes de guardar', () => {
    const local = createEmptyQuiz('es');
    local.title = 'Recuperado';
    store().init(server(), local);
    expect(store().doc.title).toBe('Recuperado');
    expect(store().saveState).toBe('dirty');
  });
});
