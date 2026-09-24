import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/web',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 30_000,

  use: {
    baseURL: 'http://localhost:8081',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'storage-sqlite',
      testDir: './e2e/storage-sqlite',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:8090' },
    },
  ],

  webServer: [
    {
      command: 'pnpm --filter @tallyui/demo exec expo start --web --port 8081',
      url: 'http://localhost:8081',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'node e2e/storage-sqlite/page/build-and-serve.mjs',
      url: 'http://localhost:8090',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
