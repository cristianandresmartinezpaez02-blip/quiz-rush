// Limpieza diaria (la ejecuta el worker): mantiene las tablas que más crecen en un tamaño sano.
// Nunca toca contenido de las personas (quizzes, partidas, progreso): solo datos temporales.
import 'server-only';
import { db } from '@quiz-rush/db';

const DAY = 86_400_000;

export async function dailyCleanup() {
  const now = Date.now();
  const [notifications, sessions, verifications, ai] = await Promise.all([
    // Avisos ya leídos de hace más de 90 días
    db.notification.deleteMany({ where: { readAt: { lt: new Date(now - 90 * DAY) } } }),
    // Sesiones caducadas (Better Auth las ignora, pero se acumulan)
    db.session.deleteMany({ where: { expiresAt: { lt: new Date(now) } } }),
    // Enlaces mágicos y verificaciones caducados
    db.verification.deleteMany({ where: { expiresAt: { lt: new Date(now) } } }),
    // Registro de uso de IA: se guarda 180 días (suficiente para cuotas y costos)
    db.aiRequest.deleteMany({ where: { createdAt: { lt: new Date(now - 180 * DAY) } } }),
  ]);
  return notifications.count + sessions.count + verifications.count + ai.count;
}
