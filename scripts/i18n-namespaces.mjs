// Calcula qué espacios de textos (namespaces de next-intl) necesitan en el navegador las páginas
// del grupo (public), recorriendo sus importaciones. El resultado se guarda en
// apps/web/lib/public-namespaces.json y lo usa app/(public)/layout.tsx para enviar solo esos
// textos (en vez de los ~76 KB de todos). Lo comprueba también una prueba automática.
// Uso: node scripts/i18n-namespaces.mjs [--check]
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const WEB = path.resolve('apps/web');
const ENTRY_DIR = path.join(WEB, 'app/(public)');
const OUT = path.join(WEB, 'lib/public-namespaces.json');

function walkDir(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walkDir(p) : /\.(tsx?|mjs)$/.test(f) ? [p] : [];
  });
}

function resolveImport(from, spec) {
  let base;
  if (spec.startsWith('@/')) base = path.join(WEB, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null; // paquetes externos
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const p = base + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

const namespaces = new Set();
const seen = new Set();
const queue = walkDir(ENTRY_DIR);
// La cabecera y la barra inferior están en el layout del grupo
while (queue.length) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/useTranslations\(\s*['"]([a-zA-Z]+)/g)) namespaces.add(m[1]);
  // useTranslations() sin espacio = todos los textos: no se puede recortar
  if (/useTranslations\(\s*\)/.test(src))
    throw new Error(`useTranslations() sin espacio en ${file}`);
  for (const m of src.matchAll(
    /(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g,
  )) {
    const target = resolveImport(file, m[1] ?? m[2]);
    if (target && !target.includes(`${path.sep}node_modules${path.sep}`)) queue.push(target);
  }
}

const list = [...namespaces].sort();
if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];
  const missing = list.filter((n) => !current.includes(n));
  if (missing.length) {
    console.error(
      `Faltan espacios en lib/public-namespaces.json: ${missing.join(', ')}. Ejecuta: node scripts/i18n-namespaces.mjs`,
    );
    process.exit(1);
  }
  console.log(`✓ public-namespaces.json al día (${list.length} espacios, ${seen.size} archivos)`);
} else {
  writeFileSync(OUT, JSON.stringify(list, null, 2) + '\n');
  console.log(`✓ ${list.length} espacios (${seen.size} archivos): ${list.join(', ')}`);
}
