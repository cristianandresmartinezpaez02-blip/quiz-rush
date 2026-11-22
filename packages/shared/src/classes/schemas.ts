// Modo profesor: clases (con código para unirse) y tareas (un quiz con fecha límite).
import { z } from 'zod';

/** Código para unirse a una clase: 6 caracteres sin los que se confunden (0/O, 1/I/L). */
export const CLASS_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CLASS_CODE_LENGTH = 6;

export function generateClassCode(random: () => number = Math.random): string {
  return Array.from(
    { length: CLASS_CODE_LENGTH },
    () => CLASS_CODE_ALPHABET[Math.floor(random() * CLASS_CODE_ALPHABET.length)],
  ).join('');
}

export const classCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(new RegExp(`^[${CLASS_CODE_ALPHABET}]{${CLASS_CODE_LENGTH}}$`), 'CLASS_CODE_INVALID');

export const createClassSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional(),
});

/** Ajustes de una tarea. */
export const assignmentSettingsSchema = z.object({
  /** Intentos permitidos por estudiante */
  maxAttempts: z.number().int().min(1).max(5).default(1),
  /** Porcentaje de aciertos para aprobar (0 = sin nota mínima) */
  passingScore: z.number().int().min(0).max(100).default(60),
  /** Certificado imprimible al aprobar */
  certificate: z.boolean().default(false),
  /** Puntos por velocidad (los profes suelen preferir que no cuente) */
  speedEnabled: z.boolean().default(false),
});
export type AssignmentSettings = z.infer<typeof assignmentSettingsSchema>;

export const createAssignmentSchema = z.object({
  quizId: z.string().min(1).max(64),
  title: z.string().trim().min(2).max(100),
  dueAt: z.coerce.date(),
  settings: assignmentSettingsSchema.default({
    maxAttempts: 1,
    passingScore: 60,
    certificate: false,
    speedEnabled: false,
  }),
});

/** Nota de un intento: porcentaje de aciertos (lo que entiende cualquier familia). */
export function attemptPercent(correct: number, total: number): number {
  return total > 0 ? Math.round((correct / total) * 100) : 0;
}

/** Código de verificación de un certificado (derivado del id del intento, fácil de dictar). */
export function certificateCode(sessionId: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < sessionId.length; i++) {
    h ^= sessionId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const s = (h >>> 0).toString(36).toUpperCase().padStart(7, '0');
  return `QR-${s.slice(0, 4)}-${s.slice(4)}`;
}
