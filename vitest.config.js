import { defineConfig } from 'vitest/config';

// Pruebas (npm test). JSX automático, igual que la app: los componentes no
// importan React.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: { include: ['src/**/*.test.{js,jsx}'] },
});
