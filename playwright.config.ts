import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:3000',
    headless: false,          // set true for CI
    viewport: { width: 1400, height: 900 },
    screenshot: 'off',        // we take manual screenshots
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite --port 3000',
    port: 3000,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
