import { existsSync } from 'node:fs';
import path from 'node:path';
import { test as base, expect, webkit, type Page } from '@playwright/test';

// Playwright's default WebKit context is ephemeral, like a Safari private window, and has no OPFS (#293), so
// WebKit runs this suite in a persistent profile, as normal Safari does. WebKit keeps one OPFS store per origin
// across profiles, so each test starts by emptying the origin's OPFS. Chromium keeps the default context.
const test = base.extend({
  context: async ({ browserName, context, baseURL }, use, testInfo) => {
    if (browserName !== 'webkit') return use(context);
    const persistent = await webkit.launchPersistentContext(testInfo.outputPath('profile'), { baseURL });
    const blank = persistent.pages()[0] ?? (await persistent.newPage());
    await blank.goto('/');
    await blank.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      for await (const name of (root as any).keys()) await root.removeEntry(name, { recursive: true });
    });
    await blank.close();
    await use(persistent);
    await persistent.close();
  },
});

// The tests need rxdb-premium, which only installs with the RXDB_PREMIUM
// token (docs/CONTRIBUTING.md). CI sets that secret for the e2e-web job;
// locally, skip with a clear reason instead of failing. Playwright runs
// this file from the repo root, where `playwright.config.ts` lives.
const rxdbPremiumInstalled = existsSync(path.resolve('packages/storage-sqlite/node_modules/rxdb-premium'));

const DB_NAME = 'e2e_sqlite_wasm';

type OpenResult =
  | { ok: true }
  | { ok: false; isStorageWorkerStartError: boolean; isStorageUnavailableError: boolean; message: string };

function openDb(page: Page, name: string): Promise<OpenResult> {
  return page.evaluate((n) => (window as any).tally.open(n), name);
}

async function timed<T>(work: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = Date.now();
  const value = await work();
  return { value, ms: Date.now() - start };
}

test.describe('storage-sqlite worker cold start (real Chromium and WebKit, ADR-061)', () => {
  // Each test gets its own Playwright BrowserContext (the `context` fixture
  // above). In Chromium that is a separate storage origin partition, so OPFS
  // never carries over between tests; in WebKit the fixture empties OPFS.
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
    console.log(`[storage-sqlite e2e] second tab rejection: ${ms}ms: ${JSON.stringify(result)}`);
    expect(result.ok, JSON.stringify(result)).toBe(false);
    if (!result.ok) {
      expect(result.isStorageWorkerStartError).toBe(true);
      expect(result.isStorageUnavailableError).toBe(false);
      expect(result.message).toContain('another tab holds the database');
    }
    expect(ms).toBeLessThan(5000);
    await second.close();

    // The first page's worker never lost its listener or its pool.
    await page.evaluate(() => (window as any).tally.insertMany(3));
    expect(await page.evaluate(() => (window as any).tally.count())).toBe(3);
  });

  test('a connector schema bump drops on the real engine: version 0 reopened as version 1 is empty, and a version-1 document inserts', async ({ page }) => {
    await page.goto('/');
    expect((await openDb(page, DB_NAME)).ok).toBe(true);
    await page.evaluate(() => (window as any).tally.insertMany(3));
    expect(await page.evaluate(() => (window as any).tally.count())).toBe(3);
    await page.evaluate(() => (window as any).tally.close());

    // A reload stands in for the upgrade: a new bundle opens the same database with the version-1 schema.
    await page.reload();
    const reopened = await page.evaluate((name) => (window as any).tally.open(name, 1), DB_NAME);
    expect(reopened.ok, JSON.stringify(reopened)).toBe(true);
    expect(await page.evaluate(() => (window as any).tally.count())).toBe(0);
    await page.evaluate(() => (window as any).tally.insertPriced());
    expect(await page.evaluate(() => (window as any).tally.count())).toBe(1);
  });

  // RxDB 17 blocks writes to a collection above schema version 0 (COL25) until its own migration check
  // has read the store; on the worker storage that read answers on a later message than the open's.
  test('a sale saved straight after addPosOrderCollection resolves is stored, never refused with COL25', async ({ page }) => {
    await page.goto('/');
    const outcomes: string[] = [];
    for (let i = 0; i < 5; i++) outcomes.push(await page.evaluate((name) => (window as any).tally.openOrdersAndSave(name), `e2e_orders_${i}`));
    expect(outcomes).toEqual(['saved', 'saved', 'saved', 'saved', 'saved']);
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

  // #293: the app shows its private-window message for this error, never "open in another tab".
  test('a WebKit private window (the default, ephemeral context) fails the open as storage unavailable, not another tab', async ({ browser, browserName, baseURL }) => {
    test.skip(browserName !== 'webkit', "WebKit's ephemeral context is the private-window case");
    const ephemeral = await browser.newContext({ baseURL });
    const page = await ephemeral.newPage();
    await page.goto('/');
    const result = await openDb(page, DB_NAME);
    // eslint-disable-next-line no-console
    console.log(`[storage-sqlite e2e] private window: ${JSON.stringify(result)}`);
    expect(result.ok, JSON.stringify(result)).toBe(false);
    if (!result.ok) {
      expect(result.isStorageUnavailableError).toBe(true);
      expect(result.isStorageWorkerStartError).toBe(false);
    }
    await ephemeral.close();
  });
});
