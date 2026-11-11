import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test, expect, type Browser, type Page } from '@playwright/test';

// The WebRTC display transport in real Chromium (ADR-085 U3): two pages open the till's data channel through an
// in-memory relay, and the refusals the unit-test fake copies are checked against the browser's own.
// Playwright runs from the repo root, where `playwright.config.ts` lives.
const pageDir = path.resolve('e2e/webrtc/page');
const outFile = path.join(pageDir, 'dist/index.js');
const ORIGIN = 'http://localhost/webrtc';

test.beforeAll(() => {
  // esbuild comes from an existing package's devDependency, as e2e/storage-sqlite/page/build-and-serve.mjs does.
  const esbuild = createRequire(path.resolve('packages/storage-sqlite/package.json'))('esbuild');
  esbuild.buildSync({
    entryPoints: [path.join(pageDir, 'index.ts')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    outfile: outFile,
  });
});

/** A page on its own context (its own device), served by routes on `localhost`, a secure context with no server. */
async function openPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  await context.route(`${ORIGIN}/**`, (route) => {
    const js = route.request().url().endsWith('.js');
    route.fulfill({
      contentType: js ? 'text/javascript' : 'text/html',
      body: readFileSync(js ? outFile : path.join(pageDir, 'index.html')),
    });
  });
  const page = await context.newPage();
  return page;
}

/** Forwards each of `from`'s outgoing signals into `to`, one at a time, in send order. */
async function relay(from: Page, to: Page) {
  let queue = Promise.resolve();
  await from.exposeFunction('signalOut', (message: unknown) => {
    queue = queue.then(() => to.evaluate((m) => window.peerTest.signalIn(m as never), message));
    return queue;
  });
}

const receipt = { currency: 'USD', totals: { totalMinor: 450 }, lineItems: [{ name: 'Tea', quantity: 1, displayAmountMinor: 450 }] };
const states = (page: Page) => page.evaluate(() => window.peerTest.states);
const received = (page: Page) => page.evaluate(() => window.peerTest.received);

test('two pages open the display channel and carry an envelope each way', async ({ browser }) => {
  const till = await openPage(browser);
  const display = await openPage(browser);
  await relay(till, display);
  await relay(display, till);
  await Promise.all([till, display].map((page) => page.goto(`${ORIGIN}/index.html`)));
  await display.evaluate(() => window.peerTest.start('display', []));
  await till.evaluate(() => window.peerTest.start('till', []));

  await expect.poll(() => states(till), { timeout: 15_000 }).toEqual(['open']);
  await expect.poll(() => states(display), { timeout: 15_000 }).toEqual(['open']);

  const cart = { receipt, linesTruncated: false };
  expect(await till.evaluate((payload) => window.peerTest.send('cart.updated', payload as never, 'c1'), cart)).toBe(true);
  await expect.poll(() => received(display)).toEqual([{ tally: 1, id: 'c1', action: 'cart.updated', payload: cart }]);

  const helloPayload = { template: { id: 'default', version: 1 } };
  expect(await display.evaluate((payload) => window.peerTest.send('display.hello', payload, 'h1'), helloPayload)).toBe(true);
  await expect.poll(() => received(till)).toEqual([{ tally: 1, id: 'h1', action: 'display.hello', payload: helloPayload }]);
});

test('Chromium refuses what the fake refuses, with the same error names', async ({ browser }) => {
  const page = await openPage(browser);
  await page.goto(`${ORIGIN}/index.html`);
  expect(await page.evaluate(() => window.peerTest.refusals())).toEqual({
    addIceCandidate: 'InvalidStateError',
    sendBeforeOpen: 'InvalidStateError',
    answerWithoutOffer: 'InvalidStateError',
    afterClose: 'InvalidStateError',
  });
});
