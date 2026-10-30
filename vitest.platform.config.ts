import { defineConfig } from 'vitest/config';
import application from './vite.config';

export default defineConfig({
  ...application,
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['tests/platform/**/*.test.tsx'],
  },
});
