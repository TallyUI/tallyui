import { defineConfig, devices } from '@playwright/test';
import { e2ePorts, isCI } from './e2e/ports';

const ci = isCI(process.env);
// Per-worktree ports (fixed 8081/8090 under CI); see e2e/ports.ts.
const ports = e2ePorts(__dirname, process.env);
// Unless reusing, fail before starting a server whose port is taken (see e2e/port-free.mjs).
const preflight = (port: number) => (ports.reuse ? '' : `node e2e/port-free.mjs ${port} && `);
// The 16.21.1 → 17.5.0 upgrade proof (#242) needs a built @tallyui/storage-sqlite@2.0.0 checkout; without one, its
// project and server are left out (see e2e/storage-sqlite-upgrade/upgrade.spec.ts).
const upgradeProof = !!process.env.E2E_V16_TREE;

export default defineConfig({
  testDir: './e2e/web',
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  workers: ci ? 1 : undefined,
  reporter: ci ? 'github' : 'html',
  timeout: 30_000,

  use: {
    baseURL: `http://localhost:${ports.web}`,
    trace: 'on-first-retry',
  },

  projects: [
    // Before any test, each server must be this worktree's (e2e/server-identity.setup.ts).
    {
      name: 'server-identity',
      testDir: './e2e',
      testMatch: /server-identity\.setup\.ts$/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['server-identity'],
    },
    {
      name: 'storage-sqlite',
      testDir: './e2e/storage-sqlite',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${ports.sqlite}` },
      dependencies: ['server-identity'],
    },
    ...(upgradeProof
      ? [{
        name: 'storage-sqlite-upgrade',
        testDir: './e2e/storage-sqlite-upgrade',
        use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${ports.sqliteUpgrade}` },
        dependencies: ['server-identity'],
      }]
      : []),
  ],

  webServer: [
    {
      command: `${preflight(ports.web)}pnpm --filter @tallyui/demo exec expo start --web --port ${ports.web}`,
      url: `http://localhost:${ports.web}`,
      reuseExistingServer: ports.reuse,
      timeout: 120_000,
    },
    {
      command: `${preflight(ports.sqlite)}node e2e/storage-sqlite/page/build-and-serve.mjs`,
      url: `http://localhost:${ports.sqlite}`,
      env: { PORT: String(ports.sqlite) },
      reuseExistingServer: ports.reuse,
      timeout: 120_000,
    },
    ...(upgradeProof
      ? [{
        command: `${preflight(ports.sqliteUpgrade)}node e2e/storage-sqlite-upgrade/page/build-and-serve.mjs`,
        url: `http://localhost:${ports.sqliteUpgrade}/v17/`,
        env: { PORT: String(ports.sqliteUpgrade) },
        reuseExistingServer: ports.reuse,
        timeout: 120_000,
      }]
      : []),
  ],
});
