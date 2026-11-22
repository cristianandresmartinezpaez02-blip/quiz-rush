// Da (o quita) el rol de administración a una cuenta existente.
// Uso: npm run admin:grant -- persona@correo.com          (dar)
//      npm run admin:grant -- persona@correo.com --quitar (quitar)
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(import.meta.dirname, '../../../.env'), quiet: true });
const { db } = await import('./index');

const email = process.argv[2]?.trim().toLowerCase();
const revoke = process.argv.includes('--quitar');
if (!email || !email.includes('@')) {
  console.error('Uso: npm run admin:grant -- persona@correo.com [--quitar]');
  process.exit(1);
}

const user = await db.user.findUnique({ where: { email }, select: { id: true, role: true } });
if (!user) {
  console.error(`No existe ninguna cuenta con el correo ${email}.`);
  process.exit(1);
}
await db.user.update({ where: { id: user.id }, data: { role: revoke ? 'user' : 'admin' } });
// Cerrar sus sesiones para que el cambio de rol se aplique al volver a entrar
await db.session.deleteMany({ where: { userId: user.id } });
console.log(
  revoke
    ? `✓ ${email} ya no es admin.`
    : `✓ ${email} ahora es admin (debe volver a iniciar sesión).`,
);
await db.$disconnect();
