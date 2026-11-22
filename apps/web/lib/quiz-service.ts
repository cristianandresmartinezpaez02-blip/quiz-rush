// Servicio de quizzes: creación, autoguardado, publicación automática y versiones.
//
// Modelo de almacenamiento:
//  • Quiz.draft (JSON)        → borrador del editor. Se escribe en CADA autoguardado (1 fila).
//  • Question / Option        → contenido PUBLICADO. Solo se sincroniza cuando el borrador es
//                               válido, y solo se tocan las preguntas que cambiaron.
//  • Quiz.revision            → control de concurrencia optimista (dos pestañas editando).
//  • QuizVersion              → snapshots para el historial (como mucho 1 automático por minuto).
import 'server-only';
import { createHash } from 'node:crypto';
import { db, Prisma, type QuizStatus } from '@quiz-rush/db';
import {
  createEmptyQuiz,
  estimateDurationSeconds,
  quizDocSchema,
  slugify,
  stableStringify,
  validateQuiz,
  VERSION_SNAPSHOT_INTERVAL_MS,
  type QuestionDoc,
  type QuizDoc,
  type ValidationIssue,
} from '@quiz-rush/shared';
import { ApiError } from './api';
import { invalidate } from './cache';

type Tx = Prisma.TransactionClient;

const asJson = (v: unknown) => v as Prisma.InputJsonValue;

/** Valores de listado (columnas) que se derivan del documento. */
function listingFields(doc: QuizDoc) {
  return {
    title: doc.title.trim(),
    description: doc.description?.trim() || null,
    category: doc.category ?? null,
    language: doc.language,
    difficulty: doc.difficulty,
    theme: doc.theme,
    coverUrl: doc.coverUrl ?? null,
    music: doc.music ?? null,
    tags: doc.tags,
    questionCount: doc.questions.length,
    durationSec: estimateDurationSeconds(doc),
    questionTypes: [...new Set(doc.questions.map((q) => q.type))],
  };
}

function hashDoc(doc: QuizDoc): string {
  return createHash('sha1').update(stableStringify(doc)).digest('hex');
}

/** Huella de una pregunta para detectar si cambió respecto a la versión publicada. */
function questionFingerprint(q: QuestionDoc, position: number): string {
  return stableStringify([
    position,
    q.type,
    q.prompt,
    q.timeLimit,
    q.points,
    q.hint ?? null,
    q.explanation ?? null,
    q.media ?? null,
    q.config ?? {},
    q.options.map((o) => [o.id, o.text, o.isCorrect, o.imageUrl ?? null]),
  ]);
}

// ───────────────────────────── Crear ─────────────────────────────

/**
 * Crea un quiz (borrador). `doc` permite empezar con contenido (IA, importación, plantilla);
 * `origin` registra de dónde vino (AI, IMPORT, TEMPLATE:<id>).
 */
export async function createQuiz(
  userId: string,
  language: 'es' | 'en' = 'es',
  doc?: QuizDoc,
  origin?: string,
) {
  const draft = doc ? quizDocSchema.parse(doc) : createEmptyQuiz(language);
  const quiz = await db.quiz.create({
    data: {
      slug: `borrador-${crypto.randomUUID().slice(0, 12)}`,
      authorId: userId,
      origin: origin ?? null,
      draft: asJson(draft),
      ...listingFields(draft),
    },
    select: { id: true },
  });
  return quiz.id;
}

// ───────────────────────────── Leer ─────────────────────────────

async function getOwnedQuiz(quizId: string, userId: string) {
  const quiz = await db.quiz.findFirst({
    where: { id: quizId, deletedAt: null },
    select: {
      id: true,
      authorId: true,
      slug: true,
      revision: true,
      status: true,
      draft: true,
      publishedAt: true,
      publishedHash: true,
      hasUnpublishedChanges: true,
      draftUpdatedAt: true,
      remixOf: {
        select: {
          id: true,
          title: true,
          author: { select: { profile: { select: { username: true } } } },
        },
      },
    },
  });
  if (!quiz) throw new ApiError(404, 'QUIZ_NOT_FOUND');
  if (quiz.authorId !== userId) throw new ApiError(403, 'NOT_OWNER');
  return quiz;
}

/** Lee el borrador; si el JSON guardado no cumple el esquema actual, se repara con valores por defecto. */
function parseDraft(raw: unknown): QuizDoc {
  const parsed = quizDocSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  console.warn('[quiz] borrador con formato antiguo; se usa uno vacío como base');
  return { ...createEmptyQuiz(), ...(typeof raw === 'object' ? raw : {}) } as QuizDoc;
}

export interface EditorQuizState {
  id: string;
  slug: string;
  revision: number;
  status: QuizStatus;
  publishedAt: string | null;
  hasUnpublishedChanges: boolean;
  savedAt: string;
  doc: QuizDoc;
  issues: ValidationIssue[];
  /** Crédito al quiz original si este es un remix */
  remixOf: { id: string; title: string; username: string } | null;
}

export async function getQuizForEditor(quizId: string, userId: string): Promise<EditorQuizState> {
  const quiz = await getOwnedQuiz(quizId, userId);
  const doc = parseDraft(quiz.draft);
  return {
    id: quiz.id,
    slug: quiz.slug,
    revision: quiz.revision,
    status: quiz.status,
    publishedAt: quiz.publishedAt?.toISOString() ?? null,
    hasUnpublishedChanges: quiz.hasUnpublishedChanges,
    savedAt: quiz.draftUpdatedAt.toISOString(),
    doc,
    issues: validateQuiz(doc),
    remixOf: quiz.remixOf
      ? {
          id: quiz.remixOf.id,
          title: quiz.remixOf.title,
          username: quiz.remixOf.author.profile?.username ?? '',
        }
      : null,
  };
}

export async function listMyQuizzes(userId: string, cursor?: string, take = 24) {
  const items = await db.quiz.findMany({
    where: { authorId: userId, deletedAt: null },
    orderBy: [{ draftUpdatedAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    select: {
      id: true,
      slug: true,
      title: true,
      coverUrl: true,
      theme: true,
      status: true,
      questionCount: true,
      playCount: true,
      ratingAvg: true,
      hasUnpublishedChanges: true,
      draftUpdatedAt: true,
    },
  });
  const hasMore = items.length > take;
  const page = hasMore ? items.slice(0, take) : items;
  return { items: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
}

// ───────────────────────────── Autoguardado ─────────────────────────────

export interface AutosaveResult {
  revision: number;
  status: QuizStatus;
  slug: string;
  publishedAt: string | null;
  hasUnpublishedChanges: boolean;
  savedAt: string;
  issues: ValidationIssue[];
  /** true si este guardado publicó el quiz por primera vez */
  justPublished: boolean;
  /** true si cambió la versión publicada (primera vez o actualización) */
  publishedChanged: boolean;
}

/**
 * Guarda el borrador. Si es válido, lo publica (o actualiza la versión publicada).
 * @param force ignora el conflicto de revisión (el usuario eligió "sobrescribir").
 */
export async function autosaveQuiz(
  quizId: string,
  userId: string,
  baseRevision: number,
  doc: QuizDoc,
  options: { force?: boolean; versionReason?: 'RESTORE' } = {},
): Promise<AutosaveResult> {
  const quiz = await getOwnedQuiz(quizId, userId);
  if (quiz.revision !== baseRevision && !options.force) {
    throw new ApiError(409, 'REVISION_CONFLICT', {
      revision: quiz.revision,
      savedAt: quiz.draftUpdatedAt.toISOString(),
      doc: parseDraft(quiz.draft),
    });
  }

  const issues = validateQuiz(doc);
  const valid = issues.length === 0;
  const hidden = quiz.status === 'HIDDEN';
  const contentHash = hashDoc(doc);
  const shouldSyncPublished = valid && !hidden && contentHash !== quiz.publishedHash;
  const justPublished = shouldSyncPublished && quiz.status === 'DRAFT';
  const now = new Date();

  const result = await db.$transaction(
    async (tx) => {
      // 1) Bloqueo optimista: solo actualiza si nadie más guardó entretanto
      const locked = await tx.quiz.updateMany({
        where: { id: quizId, revision: quiz.revision },
        data: { revision: { increment: 1 } },
      });
      if (locked.count === 0) throw new ApiError(409, 'REVISION_CONFLICT');

      let status: QuizStatus = quiz.status;
      let slug = quiz.slug;
      let publishedAt = quiz.publishedAt;

      const data: Prisma.QuizUpdateInput = {
        draft: asJson(doc),
        draftUpdatedAt: now,
      };

      if (shouldSyncPublished) {
        await syncPublishedQuestions(tx, quizId, doc);
        status = 'PUBLISHED';
        publishedAt = quiz.publishedAt ?? now;
        slug = `${slugify(doc.title)}-${quizId.slice(-8)}`;
        Object.assign(data, listingFields(doc), {
          status,
          slug,
          publishedAt,
          publishedHash: contentHash,
          // Cada cambio publicado vuelve a pasar por la revisión automática (IA, Fase 6)
          moderationStatus: 'PENDING',
        });
      } else if (quiz.status === 'DRAFT') {
        // Nunca publicado: las columnas de listado reflejan el borrador (para "Mis quizzes")
        Object.assign(data, listingFields(doc));
      }

      const hasUnpublishedChanges =
        status === 'PUBLISHED' && !valid && contentHash !== quiz.publishedHash;
      data.hasUnpublishedChanges = valid && !hidden ? false : hasUnpublishedChanges;

      const updated = await tx.quiz.update({
        where: { id: quizId },
        data,
        select: { revision: true, hasUnpublishedChanges: true },
      });

      if (justPublished) {
        await tx.profile.update({
          where: { userId },
          data: { quizzesCount: { increment: 1 } },
        });
      }

      // 2) Snapshot para el historial de versiones
      await maybeSnapshot(tx, quizId, userId, doc, {
        reason: options.versionReason ?? (justPublished ? 'PUBLISH' : 'AUTO'),
        forceSnapshot: justPublished || !!options.versionReason,
      });

      return {
        revision: updated.revision,
        status,
        slug,
        publishedAt: publishedAt?.toISOString() ?? null,
        hasUnpublishedChanges: updated.hasUnpublishedChanges,
        savedAt: now.toISOString(),
        issues,
        justPublished,
        publishedChanged: shouldSyncPublished,
      };
    },
    { timeout: 15_000 },
  );

  // La página pública y las secciones cacheadas deben reflejar la nueva versión publicada
  if (shouldSyncPublished) await invalidate(`quiz:public:${quizId}`, `quiz:similar:${quizId}`);
  return result;
}

/**
 * Sincroniza las tablas Question/Option con el documento, tocando solo lo que cambió.
 * Así, mientras alguien escribe en un quiz publicado, cada guardado actualiza 1 pregunta y no 100.
 */
async function syncPublishedQuestions(tx: Tx, quizId: string, doc: QuizDoc) {
  const existing = await tx.question.findMany({
    where: { quizId },
    include: { options: { orderBy: { position: 'asc' } } },
  });
  const existingById = new Map(existing.map((q) => [q.id, q]));
  const docIds = new Set(doc.questions.map((q) => q.id));

  // Preguntas eliminadas en el editor
  const removed = existing.filter((q) => !docIds.has(q.id)).map((q) => q.id);
  if (removed.length) await tx.question.deleteMany({ where: { quizId, id: { in: removed } } });

  for (const [position, q] of doc.questions.entries()) {
    const row = existingById.get(q.id);
    const fields = {
      position,
      type: q.type,
      prompt: q.prompt.trim(),
      timeLimit: q.timeLimit,
      points: q.points,
      hint: q.hint?.trim() || null,
      explanation: q.explanation?.trim() || null,
      media: q.media ? asJson(q.media) : Prisma.DbNull,
      config: asJson(q.config ?? {}),
    };
    const options = q.options.map((o, i) => ({
      id: o.id,
      questionId: q.id,
      position: i,
      text: o.text.trim(),
      isCorrect: o.isCorrect,
      imageUrl: o.imageUrl ?? null,
    }));

    if (!row) {
      try {
        await tx.question.create({ data: { id: q.id, quizId, ...fields } });
      } catch (err) {
        // Un id de pregunta que ya pertenece a otro quiz: petición manipulada
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ApiError(400, 'DUPLICATE_QUESTION_ID');
        }
        throw err;
      }
      if (options.length) await tx.option.createMany({ data: options });
      continue;
    }

    const rowAsDoc: QuestionDoc = {
      id: row.id,
      type: row.type,
      prompt: row.prompt,
      timeLimit: row.timeLimit,
      points: row.points,
      hint: row.hint,
      explanation: row.explanation,
      media: (row.media as QuestionDoc['media']) ?? null,
      config: (row.config as QuestionDoc['config']) ?? {},
      options: row.options.map((o) => ({
        id: o.id,
        text: o.text,
        isCorrect: o.isCorrect,
        imageUrl: o.imageUrl,
      })),
    };
    const normalizedDoc: QuestionDoc = {
      ...q,
      prompt: fields.prompt,
      hint: fields.hint,
      explanation: fields.explanation,
      options: options.map((o) => ({
        id: o.id,
        text: o.text,
        isCorrect: o.isCorrect,
        imageUrl: o.imageUrl,
      })),
    };
    if (
      questionFingerprint(rowAsDoc, row.position) === questionFingerprint(normalizedDoc, position)
    ) {
      continue; // sin cambios
    }

    await tx.question.update({ where: { id: q.id }, data: fields });
    await tx.option.deleteMany({ where: { questionId: q.id } });
    if (options.length) {
      try {
        await tx.option.createMany({ data: options });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ApiError(400, 'DUPLICATE_OPTION_ID');
        }
        throw err;
      }
    }
  }
}

/** Crea un snapshot si ha pasado al menos un minuto desde el último (o si se fuerza). */
async function maybeSnapshot(
  tx: Tx,
  quizId: string,
  userId: string,
  doc: QuizDoc,
  opts: { reason: 'AUTO' | 'PUBLISH' | 'RESTORE' | 'MANUAL'; forceSnapshot?: boolean },
) {
  const last = await tx.quizVersion.findFirst({
    where: { quizId },
    orderBy: { number: 'desc' },
    select: { number: true, createdAt: true, snapshot: true },
  });
  if (!opts.forceSnapshot && last) {
    const recent = Date.now() - last.createdAt.getTime() < VERSION_SNAPSHOT_INTERVAL_MS;
    if (recent) return;
    // No crear versiones idénticas a la anterior
    if (stableStringify(last.snapshot) === stableStringify(doc)) return;
  }
  await tx.quizVersion.create({
    data: {
      quizId,
      number: (last?.number ?? 0) + 1,
      reason: opts.reason,
      title: doc.title.trim() || '—',
      questionCount: doc.questions.length,
      snapshot: asJson(doc),
      createdById: userId,
    },
  });
}

// ───────────────────────────── Versiones ─────────────────────────────

export async function listVersions(quizId: string, userId: string) {
  await getOwnedQuiz(quizId, userId);
  return db.quizVersion.findMany({
    where: { quizId },
    orderBy: { number: 'desc' },
    take: 50,
    select: {
      id: true,
      number: true,
      reason: true,
      title: true,
      questionCount: true,
      createdAt: true,
    },
  });
}

export async function getVersion(quizId: string, versionId: string, userId: string) {
  await getOwnedQuiz(quizId, userId);
  const version = await db.quizVersion.findFirst({ where: { id: versionId, quizId } });
  if (!version) throw new ApiError(404, 'VERSION_NOT_FOUND');
  return { ...version, snapshot: parseDraft(version.snapshot) };
}

/** Guarda manualmente una versión con el borrador actual ("Guardar versión"). */
export async function createManualVersion(quizId: string, userId: string) {
  const quiz = await getOwnedQuiz(quizId, userId);
  const doc = parseDraft(quiz.draft);
  await db.$transaction((tx) =>
    maybeSnapshot(tx, quizId, userId, doc, { reason: 'MANUAL', forceSnapshot: true }),
  );
}

/**
 * Restaura una versión anterior. Antes guarda el estado actual como versión,
 * para que restaurar nunca haga perder trabajo.
 */
export async function restoreVersion(quizId: string, versionId: string, userId: string) {
  const quiz = await getOwnedQuiz(quizId, userId);
  const version = await getVersion(quizId, versionId, userId);
  await db.$transaction((tx) =>
    maybeSnapshot(tx, quizId, userId, parseDraft(quiz.draft), {
      reason: 'MANUAL',
      forceSnapshot: true,
    }),
  );
  return autosaveQuiz(quizId, userId, quiz.revision, version.snapshot, {
    force: true,
    versionReason: 'RESTORE',
  });
}

// ───────────────────────────── Borrar ─────────────────────────────

export async function deleteQuiz(quizId: string, userId: string) {
  const quiz = await getOwnedQuiz(quizId, userId);
  await db.$transaction(async (tx) => {
    await tx.quiz.update({ where: { id: quizId }, data: { deletedAt: new Date() } });
    if (quiz.status === 'PUBLISHED') {
      await tx.profile.update({ where: { userId }, data: { quizzesCount: { decrement: 1 } } });
    }
  });
}
