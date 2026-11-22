import { defineConfig } from 'tsup';

// Empaqueta el servidor y los paquetes internos (@quiz-rush/*) en un solo archivo.
// Las dependencias de esos paquetes con código nativo o CommonJS (pg, Prisma) se dejan
// fuera del bundle y se cargan desde node_modules en tiempo de ejecución.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  sourcemap: true,
  clean: true,
  noExternal: [/^@quiz-rush\//],
  external: ['pg', /^@prisma\//, 'dotenv'],
});
