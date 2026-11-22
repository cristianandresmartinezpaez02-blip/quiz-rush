// Ejecuta un comando con las variables del .env de la RAÍZ del monorepo cargadas.
// Uso (desde una app): node ../../scripts/with-env.mjs next dev --port 3000
// Las variables ya definidas en el entorno (p. ej. en producción) tienen prioridad.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) {
  const before = { ...process.env };
  process.loadEnvFile(envFile);
  Object.assign(process.env, before); // no sobrescribir lo que ya venía del entorno
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('Uso: node scripts/with-env.mjs <comando> [argumentos…]');
  process.exit(1);
}

/**
 * Resuelve el script JavaScript del binario de un paquete (p. ej. "next" → next/dist/bin/next)
 * para ejecutarlo con el propio Node, sin shell: funciona igual en Windows, macOS y Linux
 * y evita concatenar argumentos en una línea de comandos.
 */
function resolveBin(name) {
  try {
    const require = createRequire(path.join(process.cwd(), 'package.json'));
    const pkgPath = require.resolve(`${name}/package.json`);
    const { bin } = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const rel = typeof bin === 'string' ? bin : bin?.[name];
    return rel ? path.join(path.dirname(pkgPath), rel) : null;
  } catch {
    return null;
  }
}

const binScript = resolveBin(command);
const child = binScript
  ? spawn(process.execPath, [binScript, ...args], { stdio: 'inherit' })
  : spawn(command, args, { stdio: 'inherit' });

child.on('exit', (code, signal) =>
  signal ? process.kill(process.pid, signal) : process.exit(code ?? 0),
);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
