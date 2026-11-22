// Las páginas del grupo (public) solo reciben algunos textos: si un componente suyo empieza a
// usar otro espacio de textos, esta prueba avisa (se arregla con node scripts/i18n-namespaces.mjs).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('textos de las páginas públicas', () => {
  it('public-namespaces.json incluye todo lo que usan', () => {
    const root = path.resolve(import.meta.dirname, '../../..');
    const out = execFileSync(process.execPath, ['scripts/i18n-namespaces.mjs', '--check'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(out).toContain('al día');
  });
});
