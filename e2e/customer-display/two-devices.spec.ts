import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test, expect, type Browser, type Page } from '@playwright/test';
import { createMemoryDisplaySignalling } from '../../packages/core/src/server/display-signalling/memory-server';
import { DisplaySignallingError, type DisplaySignalling } from '../../packages/core/src/types/display-signalling';

// The second-device customer display (ADR-085 U6): a till and a display in two Chromium contexts pair through the
// reference signalling server, run here in Node and bridged into each page, and the sale reaches the display over a
// real WebRTC data channel, or through the snapshot fallback while the peer link is blocked.
// Playwright runs from the repo root, where `playwright.config.ts` lives.
const pageDir = path.resolve('e2e/customer-display/page');
const outFile = path.join(pageDir, 'dist/index.js');
const ORIGIN = 'http://localhost/customer-display';
const WAIT = { timeout: 45_000 };

test.beforeAll(() => {
  // esbuild comes from an existing package's devDependency, as e2e/webrtc/peer-link.spec.ts does. The `source`
  // condition resolves `@tallyui/core` to its source, so the page and the pos package share one DisplaySignallingError.
  const esbuild = createRequire(path.resolve('packages/storage-sqlite/package.json'))('esbuild');
  esbuild.buildSync({
    entryPoints: [path.join(pageDir, 'index.ts')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    conditions: ['source'],
    outfile: outFile,
  });
});

/** Throws outside DisplaySignallingError that the bridge saw; each one fails the test. */
let bridgeErrors: string[] = [];
let pages: Array<{ role: string; page: Page }> = [];

test.beforeEach(() => {
  bridgeErrors = [];
  pages = [];
});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    for (const { role, page } of pages) console.log(`${role} errors:`, await page.evaluate(() => window.displayTest.errors).catch(String));
  }
  await Promise.all(pages.map(({ page }) => page.context().close()));
  expect(bridgeErrors).toEqual([]);
});

/** One reference server, and a till and a display page on their own contexts, each bridged to it. */
async function devices(browser: Browser, options: { blockPeer: boolean }) {
  const { signalling, harness } = createMemoryDisplaySignalling();
  const open = async (role: string, ctx: unknown) => {
    const context = await browser.newContext();
    await context.route(`${ORIGIN}/**`, (route) => {
      const js = route.request().url().endsWith('.js');
      route.fulfill({
        contentType: js ? 'text/javascript' : 'text/html',
        body: readFileSync(js ? outFile : path.join(pageDir, 'index.html')),
      });
    });
    const page = await context.newPage();
    await page.exposeFunction('signallingCall', async (method: keyof DisplaySignalling, args: unknown[]) => {
      // Blocking the peer link: no offer, answer or candidate reaches the other side; the snapshot calls still go through.
      if (options.blockPeer && (method === 'sendSignal' || method === 'displaySendSignal')) return { ok: undefined };
      try {
        const call = signalling[method] as (context: unknown, ...rest: unknown[]) => Promise<unknown>;
        return { ok: await call.call(signalling, ctx, ...args) };
      } catch (error) {
        if (error instanceof DisplaySignallingError) return { error: error.code };
        bridgeErrors.push(`${method}: ${String(error)}`);
        return { error: 'server' };
      }
    });
    await page.goto(`${ORIGIN}/index.html`);
    pages.push({ role, page });
    return page;
  };
  const till = await open('till', await harness.till({ cashierId: 'c1', canPair: true }));
  const display = await open('display', harness.display('192.0.2.10'));
  await till.evaluate(() => window.displayTest.startTill());
  await display.evaluate(() => window.displayTest.startDisplay());
  return { till, display };
}

const phaseOf = (display: Page) => display.evaluate(() => window.displayTest.phase());
const lineNames = (display: Page) => display.evaluate(() => window.displayTest.lineNames());
const listed = (till: Page) => till.evaluate(() => window.displayTest.displays());

/** Pairs the display as "Front counter", the cashier confirming the claim whose check code the display shows (#705). */
async function pair(till: Page, display: Page): Promise<string> {
  const code = await till.evaluate(() => window.displayTest.startPairing());
  await display.evaluate((c) => window.displayTest.claim(c, 'Front counter'), code);
  await expect.poll(async () => (await phaseOf(display)).phase, WAIT).toBe('waiting');
  const waiting = await phaseOf(display);
  const checkCode = waiting.phase === 'waiting' ? waiting.checkCode : '';
  await expect.poll(() => till.evaluate(() => window.displayTest.claims().map((claim) => claim.checkCode)), WAIT).toEqual([checkCode]);
  const [claim] = await till.evaluate(() => window.displayTest.claims());
  await till.evaluate((id) => window.displayTest.confirm(id), claim.claimId);
  await expect.poll(async () => (await phaseOf(display)).phase, WAIT).toBe('paired');
  await expect.poll(async () => (await listed(till)).map((entry) => entry.name), WAIT).toEqual(['Front counter']);
  return (await listed(till))[0].displayId;
}

test('pair with the cashier confirming, a sale over the peer link, and Forget clears it', async ({ browser }) => {
  test.setTimeout(90_000);
  const { till, display } = await devices(browser, { blockPeer: false });
  const displayId = await pair(till, display);
  await expect.poll(async () => (await listed(till)).map((entry) => entry.link), WAIT).toEqual(['open']);

  await till.evaluate(() => window.displayTest.showCart('Tea', 450));
  await expect.poll(() => lineNames(display), WAIT).toEqual(['Tea']);
  expect(await phaseOf(display)).toMatchObject({ phase: 'paired', link: 'open', source: 'peer' });

  await till.evaluate((id) => window.displayTest.forget(id), displayId);
  await expect.poll(() => phaseOf(display), WAIT).toEqual({ phase: 'enter-code', error: 'forgotten' });
  expect(await lineNames(display)).toEqual([]);
  expect(await listed(till)).toEqual([]);
});

test('with the peer link blocked, the display shows the sale through the snapshot fallback', async ({ browser }) => {
  test.setTimeout(90_000);
  const { till, display } = await devices(browser, { blockPeer: true });
  await pair(till, display);

  await till.evaluate(() => window.displayTest.showCart('Coffee', 380));
  await expect.poll(() => lineNames(display), WAIT).toEqual(['Coffee']);
  const phase = await phaseOf(display);
  expect(phase).toMatchObject({ phase: 'paired', source: 'snapshot' });
  expect(phase).not.toMatchObject({ link: 'open' });

  await till.evaluate(() => window.displayTest.showIdle());
  await expect.poll(() => lineNames(display), WAIT).toEqual([]);
  for (const page of [till, display]) expect(await page.evaluate(() => window.displayTest.linkStates)).not.toContain('open');
});
