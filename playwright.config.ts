import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './__tests__/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  retries: 1,
  use: {
    browserName: 'chromium',
    headless: true,
  },
  webServer: {
    command: 'npx tsx __tests__/e2e/start-server.ts',
    port: 9876,
    timeout: 10_000,
    reuseExistingServer: true,
  },
});
