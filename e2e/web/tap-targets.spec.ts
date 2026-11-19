import { test, expect, type Page } from '@playwright/test';

// Tap targets (front desk ruling, 2026-11-16): under a coarse pointer each control gives the finger at least 44 px,
// measured as the span where a touch lands on the control, while the drawn control keeps its size.
const VIEWPORT = { width: 390, height: 844 };
const SCALES = ['compact', 'regular'] as const;
const FIXED = ['register-bar-menu', 'camera-scan-button', 'tab-products', 'tab-cart', 'view-toggle-grid', 'view-toggle-table'];
const SQUARE = ['register-bar-menu', 'camera-scan-button'];
// 44 px less one 0.5 px probe step.
const MIN_EXTENT = 43.5;

async function open(page: Page, scale: string) {
  await page.goto(`/pos/tap-targets?scale=${scale}`);
  await expect(page.getByTestId('register-bar-menu')).toBeVisible();
  await expect(page.getByTestId('category-nav-coffee')).toBeVisible();
}

async function controlIds(page: Page): Promise<string[]> {
  const chips = await page.locator('[data-testid^="category-nav-"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')!));
  expect(chips.length).toBe(5);
  return [...FIXED, ...chips];
}

/** Per control: the span, every 0.5 px from 40 px before the box to 40 px past it, where a touch is the control's. */
function extents(page: Page, ids: string[]) {
  return page.evaluate((testIds) => {
    const out: Record<string, { vertical: number; horizontal: number }> = {};
    for (const id of testIds) {
      const el = document.querySelector(`[data-testid="${id}"]`)!;
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const box = el.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const hits = (point: (t: number) => [number, number], from: number, to: number) => {
        let count = 0;
        for (let t = from - 40; t <= to + 40; t += 0.5) {
          const [x, y] = point(t);
          const hit = document.elementFromPoint(x, y);
          if (hit && el.contains(hit)) count += 1;
        }
        return count * 0.5;
      };
      out[id] = {
        vertical: hits((y) => [cx, y], box.top, box.bottom),
        horizontal: hits((x) => [x, cy], box.left, box.right),
      };
    }
    return out;
  }, ids);
}

function boxes(page: Page, ids: string[]) {
  return page.evaluate((testIds) => Object.fromEntries(testIds.map((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)!;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const { width, height } = el.getBoundingClientRect();
    return [id, { width, height }];
  })), ids);
}

test.describe('tap targets under a coarse pointer', () => {
  test.use({ viewport: VIEWPORT, hasTouch: true, isMobile: true });

  test('the page reports a coarse pointer', async ({ page }) => {
    await open(page, 'compact');
    expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)).toBe(true);
  });

  for (const scale of SCALES) {
    test(`every control's hit extent is at least 44 px at ${scale}`, async ({ page }) => {
      await open(page, scale);
      const ids = await controlIds(page);
      const measured = await extents(page, ids);
      console.log(`hit extents at ${scale}: ${JSON.stringify(measured)}`);
      for (const id of ids) {
        expect.soft(measured[id].vertical, `${id} vertical extent at ${scale}`).toBeGreaterThanOrEqual(MIN_EXTENT);
      }
      for (const id of SQUARE) {
        expect.soft(measured[id].horizontal, `${id} horizontal extent at ${scale}`).toBeGreaterThanOrEqual(MIN_EXTENT);
      }
    });

    test(`every control is drawn at its fine-pointer size at ${scale}`, async ({ page, browser, baseURL }) => {
      await open(page, scale);
      const ids = await controlIds(page);
      const coarse = await boxes(page, ids);
      const context = await browser.newContext({ viewport: VIEWPORT, baseURL });
      try {
        const finePage = await context.newPage();
        await open(finePage, scale);
        const fine = await boxes(finePage, ids);
        for (const id of ids) {
          expect.soft(Math.abs(coarse[id].width - fine[id].width), `${id} width at ${scale}`).toBeLessThanOrEqual(0.5);
          expect.soft(Math.abs(coarse[id].height - fine[id].height), `${id} height at ${scale}`).toBeLessThanOrEqual(0.5);
        }
      } finally {
        await context.close();
      }
    });
  }
});

test.describe('tap targets under a fine pointer', () => {
  test.use({ viewport: VIEWPORT, hasTouch: false, isMobile: false });

  test('renders no band', async ({ page }) => {
    await open(page, 'compact');
    expect(await page.evaluate(() => window.matchMedia('(pointer: fine)').matches)).toBe(true);
    await expect(page.getByTestId('min-target-band')).toHaveCount(0);
  });
});
