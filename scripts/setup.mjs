// Prepara el entorno local: crea .env desde .env.example con un secreto aleatorio y, si faltan,
// añade las claves VAPID de las notificaciones push y el secreto del worker (también a un .env
// que ya existía).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { generateVAPIDKeys } from 'web-push';

if (existsSync('.env')) {
  console.log('✓ .env ya existe, no se modifica el secreto.');
} else {
  const secret = randomBytes(32).toString('base64');
  const content = readFileSync('.env.example', 'utf8').replace(
    /BETTER_AUTH_SECRET=".*"/,
    `BETTER_AUTH_SECRET="${secret}"`,
  );
  writeFileSync('.env', content);
  console.log('✓ .env creado con un BETTER_AUTH_SECRET aleatorio.');
}

// Claves VAPID (Web Push): se generan una vez; cambiarlas invalida las suscripciones existentes.
const env = readFileSync('.env', 'utf8');
if (/^VAPID_PRIVATE_KEY=".+"/m.test(env)) {
  console.log('✓ Claves VAPID ya configuradas.');
} else {
  const keys = generateVAPIDKeys();
  const block = [
    'NEXT_PUBLIC_VAPID_PUBLIC_KEY="' + keys.publicKey + '"',
    'VAPID_PRIVATE_KEY="' + keys.privateKey + '"',
  ];
  let next = env;
  for (const line of block) {
    const name = line.slice(0, line.indexOf('='));
    const re = new RegExp(`^${name}=.*$`, 'm');
    next = re.test(next) ? next.replace(re, line) : `${next.trimEnd()}\n${line}\n`;
  }
  writeFileSync('.env', next);
  console.log('✓ Claves VAPID generadas para las notificaciones push.');
}

// Secreto compartido entre la web y el worker (rutas internas de trabajos)
const env2 = readFileSync('.env', 'utf8');
if (/^JOBS_SECRET=".{16,}"/m.test(env2)) {
  console.log('✓ JOBS_SECRET ya configurado.');
} else {
  const line = 'JOBS_SECRET="' + randomBytes(32).toString('base64url') + '"';
  const next = /^JOBS_SECRET=.*$/m.test(env2)
    ? env2.replace(/^JOBS_SECRET=.*$/m, line)
    : `${env2.trimEnd()}\n${line}\n`;
  writeFileSync('.env', next);
  console.log('✓ JOBS_SECRET generado para el worker.');
}
