import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: 'library.spec.ts', workers: 1,
  use: { baseURL: 'http://127.0.0.1:4310', headless: true, launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }, viewport: { width: 1800, height: 1000 } },
  webServer: { command: 'npm run dev:embed -- --host 127.0.0.1', url: 'http://127.0.0.1:4310/isolated.html', reuseExistingServer: !process.env.CI, timeout: 30000 },
});
