import { defineConfig, devices } from '@playwright/test';
import { e2ePorts } from './e2e/ports';

// Per-worktree ports (fixed 8081/8090 under CI); see e2e/ports.ts.
const ports = e2ePorts(__dirname, process.env);

export default defineConfig({
  testDir: './e2e/web',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 30_000,

  use: {
    baseURL: `http://localhost:${ports.web}`,
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
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${ports.sqlite}` },
    },
  ],

  webServer: [
    {
      command: `pnpm --filter @tallyui/demo exec expo start --web --port ${ports.web}`,
      url: `http://localhost:${ports.web}`,
      reuseExistingServer: ports.reuse,
      timeout: 120_000,
    },
    {
      command: 'node e2e/storage-sqlite/page/build-and-serve.mjs',
      url: `http://localhost:${ports.sqlite}`,
      env: { PORT: String(ports.sqlite) },
      reuseExistingServer: ports.reuse,
      timeout: 120_000,
    },
  ],
});
