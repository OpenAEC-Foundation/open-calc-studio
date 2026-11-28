import { configDefaults, defineConfig } from 'vitest/config';
import application from './vite.config';

export default defineConfig({
  ...application,
  // Neem de gedeelde testinstellingen (o.a. de 15 s-limieten) over; alleen include en
  // exclude verschillen, want de app-config sluit tests/** uit (knownbug 277).
  test: {
    ...application.test,
    include: ['tests/platform/**/*.test.tsx'],
    exclude: [...configDefaults.exclude],
  },
});
