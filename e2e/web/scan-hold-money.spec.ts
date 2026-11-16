// Real-browser proof for useBarcodeScanner's 'hold-money' field policy (packages/pos/src/scanner/use-barcode-scanner.ts).
// The unit tests run in jsdom, which inserts no character for a keydown; this proves with Chromium's real keyboard that
// a scan never types into a controlled React money field, and that typing still goes in at the caret.
import { createRequire } from 'node:module';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

declare global {
  interface Window { scans: string[]; keyLog: { key: string; at: number }[] }
}

const repoRoot = path.resolve(__dirname, '../..');
// localhost is a secure context; the routes below serve it, so no server is needed.
const ORIGIN = 'http://localhost/scan-hold-money';
const HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>scan hold-money e2e</title></head>'
  + '<body><div id="root"></div><script src="/scan-hold-money/index.js"></script></body></html>';
let bundle = '';

test.beforeAll(() => {
  // Resolved exactly as e2e/web/hid-scanner.spec.ts resolves it; bundled in memory, so nothing is written to the tree.
  const esbuild = createRequire(path.join(repoRoot, 'packages/storage-sqlite/package.json'))('esbuild');
  const result = esbuild.buildSync({
    entryPoints: [path.join(__dirname, 'scan-hold-money-page/index.ts')],
    bundle: true, format: 'iife', platform: 'browser', target: 'es2022', write: false, metafile: true,
  });
  // One React: the hook (packages/pos) and react-dom must share the copy the page renders with.
  const inputs = Object.keys(result.metafile.inputs);
  expect(inputs.filter((input) => /react\/index\.js$/.test(input))).toHaveLength(1);
  expect(inputs.filter((input) => /react-dom\/client\.js$/.test(input))).toHaveLength(1);
  bundle = result.outputFiles[0].text;
});

async function openPage(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.context().route(`${ORIGIN}/**`, (route) => {
    const js = route.request().url().endsWith('.js');
    return route.fulfill({ contentType: js ? 'text/javascript' : 'text/html', body: js ? bundle : HTML });
  });
  await page.goto(`${ORIGIN}/index.html`);
  await expect(page.getByTestId('money')).toBeVisible();
  expect(errors).toEqual([]);
}

const scans = (page: Page) => page.evaluate(() => window.scans);

test.describe("useBarcodeScanner fieldPolicy 'hold-money' in Chromium", () => {
  test('E1: a scan into the money field is scanned and never reaches it', async ({ page }) => {
    await openPage(page);
    const money = page.getByTestId('money');
    await money.focus();
    await page.keyboard.type('036000291452');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);

    const times = await page.evaluate(() => window.keyLog.filter(({ key }) => key.length === 1).map(({ at }) => at));
    const gaps = times.slice(1).map((at, index) => at - times[index]);
    console.log(`E1 key gaps (ms) ${JSON.stringify(gaps)}, largest ${Math.max(...gaps)} (threshold 24)`);
    expect(await scans(page)).toEqual(['036000291452']);
    await expect(money).toHaveValue('');
  });

  test('E2: typing at human speed goes into the money field', async ({ page }) => {
    await openPage(page);
    await page.getByTestId('money').focus();
    await page.keyboard.type('12.50', { delay: 80 });
    await page.waitForTimeout(200);

    await expect(page.getByTestId('money')).toHaveValue('12.50');
    expect(await scans(page)).toEqual([]);
  });

  test('E3: typed keys replace the selection', async ({ page }) => {
    await openPage(page);
    const money = page.getByTestId('money');
    await money.focus();
    await page.keyboard.type('1000', { delay: 80 });
    // The last key is held until its release timer: select only once it is in.
    await expect(money).toHaveValue('1000');
    await money.evaluate((input: HTMLInputElement) => input.setSelectionRange(1, 3));
    await page.keyboard.type('5', { delay: 80 });
    await page.waitForTimeout(200);

    await expect(money).toHaveValue('150');
  });

  test('E4: Backspace acts on the held keys', async ({ page }) => {
    await openPage(page);
    const money = page.getByTestId('money');
    await money.focus();
    await page.keyboard.type('123', { delay: 80 });
    await page.keyboard.press('Backspace');

    await expect(money).toHaveValue('12');
  });

  test('E5: a scan into a plain field still types and is not scanned', async ({ page }) => {
    await openPage(page);
    const note = page.getByTestId('note');
    await note.focus();
    await page.keyboard.type('036000291452');
    await page.waitForTimeout(400);

    expect(await scans(page)).toEqual([]);
    await expect(note).toHaveValue('036000291452');
  });
});
