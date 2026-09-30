import { defineConfig, devices } from '@playwright/test';
import { e2ePorts, isCI } from './e2e/ports';

const ci = isCI(process.env);
// Per-worktree ports (fixed 8081/8090 under CI); see e2e/ports.ts.
const ports = e2ePorts(__dirname, process.env);
// Unless reusing, fail before starting a server whose port is taken (see e2e/port-free.mjs).
const preflight = (port: number) => (ports.reuse ? '' : `node e2e/port-free.mjs ${port} && `);

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
    // The same storage suite in WebKit (Safari, iPad web tills; #293). Its fixture runs each test in a persistent
    // profile, as normal Safari browsing does; one test uses the default, ephemeral context, a private window.
    {
      name: 'storage-sqlite-webkit',
      testDir: './e2e/storage-sqlite',
      use: { ...devices['Desktop Safari'], baseURL: `http://localhost:${ports.sqlite}` },
      dependencies: ['server-identity'],
    },
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
  ],
});
