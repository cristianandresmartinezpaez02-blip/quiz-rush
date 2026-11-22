import { defineConfig } from 'tsup';

// Empaqueta el worker y @quiz-rush/shared en un solo archivo (no usa la base de datos).
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  sourcemap: true,
  clean: true,
  noExternal: [/^@quiz-rush\//],
});
