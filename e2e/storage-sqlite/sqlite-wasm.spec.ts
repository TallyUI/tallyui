import { existsSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

// The tests need rxdb-premium, which only installs with the RXDB_PREMIUM
// token (docs/CONTRIBUTING.md). CI sets that secret for the e2e-web job;
// locally, skip with a clear reason instead of failing. Playwright runs
// this file from the repo root, where `playwright.config.ts` lives.
const rxdbPremiumInstalled = existsSync(path.resolve('packages/storage-sqlite/node_modules/rxdb-premium'));

const DB_NAME = 'e2e_sqlite_wasm';

type OpenResult = { ok: true } | { ok: false; isStorageWorkerStartError: boolean; message: string };

function openDb(page: Page, name: string): Promise<OpenResult> {
  return page.evaluate((n) => (window as any).tally.open(n), name);
}

async function timed<T>(work: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = Date.now();
  const value = await work();
  return { value, ms: Date.now() - start };
}

test.describe('storage-sqlite worker cold start (real Chromium, ADR-061)', () => {
  // Each test gets its own Playwright BrowserContext (the default `page`
  // fixture), which is a separate storage origin partition, so OPFS never
  // carries over between tests without any explicit clearing.
  test.skip(!rxdbPremiumInstalled, 'rxdb-premium is not installed (needs the RXDB_PREMIUM token; see docs/CONTRIBUTING.md)');

  test('a fresh page opens the database, and the open completes well under 5s', async ({ page }) => {
    await page.goto('/');
    const { value: result, ms } = await timed(() => openDb(page, DB_NAME));
    // eslint-disable-next-line no-console
    console.log(`[storage-sqlite e2e] cold open: ${ms}ms`);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    // Only an upper bound: CI timings vary.
    expect(ms).toBeLessThan(5000);
  });

  test('500 inserts and a compound-index query survive a reload', async ({ page }) => {
    await page.goto('/');
    expect((await openDb(page, DB_NAME)).ok).toBe(true);

    await page.evaluate(() => (window as any).tally.insertMany(500));
    expect(await page.evaluate(() => (window as any).tally.count())).toBe(500);
    const before = await page.evaluate(() => (window as any).tally.queryByIndex('even'));
    expect(before).toHaveLength(250);

    await page.reload();
    expect((await openDb(page, DB_NAME)).ok).toBe(true);
    expect(await page.evaluate(() => (window as any).tally.count())).toBe(500);
    const after = await page.evaluate(() => (window as any).tally.queryByIndex('even'));
    expect(after).toEqual(before);
  });

  test('a second tab is rejected within 5s while the first keeps working', async ({ page, context }) => {
    await page.goto('/');
    expect((await openDb(page, DB_NAME)).ok).toBe(true);

    const second = await context.newPage();
    await second.goto('/');
    const { value: result, ms } = await timed(() => openDb(second, DB_NAME));
    // eslint-disable-next-line no-console
    console.log(`[storage-sqlite e2e] second tab rejection: ${ms}ms`);
    expect(result.ok, JSON.stringify(result)).toBe(false);
    if (!result.ok) expect(result.isStorageWorkerStartError).toBe(true);
    expect(ms).toBeLessThan(5000);
    await second.close();

    // The first page's worker never lost its listener or its pool.
    await page.evaluate(() => (window as any).tally.insertMany(3));
    expect(await page.evaluate(() => (window as any).tally.count())).toBe(3);
  });

  test('close, storage.terminate(), then a new storage reopens the database within 10s', async ({ page }) => {
    await page.goto('/');
    expect((await openDb(page, DB_NAME)).ok).toBe(true);
    await page.evaluate(() => (window as any).tally.insertMany(1));

    // The park order (ADR-061, amendment 1): close with the worker alive, then terminate.
    await page.evaluate(() => (window as any).tally.close());
    await page.evaluate(() => (window as any).tally.terminate());

    // A fresh open builds a new storage from the same workerInput. Without the
    // cache eviction it reuses the terminated worker's channel and hangs.
    const { value: reopened, ms } = await timed(() =>
      page.evaluate(async (name) => {
        const tally = (window as any).tally;
        const reopen = async () => {
          const result = await tally.open(name);
          return result.ok ? tally.queryByIndex('even') : result;
        };
        const deadline = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('the reopen after terminate() hung past 10s')), 10_000),
        );
        return Promise.race([reopen(), deadline]);
      }, DB_NAME),
    );
    // eslint-disable-next-line no-console
    console.log(`[storage-sqlite e2e] reopen after terminate: ${ms}ms`);
    expect(reopened).toEqual(['item-0000']);
  });
});
