import { test, expect, type Locator, type Page } from '@playwright/test';

/** The computed translateX of an element, from its `matrix(a, b, c, d, tx, ty)` (or `none`, at rest). */
async function translateX(element: Locator) {
  const transform = await element.evaluate((node) => getComputedStyle(node).transform);
  return transform === 'none' ? 0 : Number(transform.match(/^matrix\((.+)\)$/)![1].split(',')[4]);
}

async function addShirt(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/pos/sale-charges');
  await page.getByRole('button', { name: 'Add Shirt' }).click();
}

async function addBag(page: Page) {
  await addShirt(page);
  await page.getByRole('button', { name: 'Add charge', exact: true }).click();
  const form = page.getByTestId('charge-form');
  await form.getByRole('button', { name: 'Fee', exact: true }).click();
  await form.getByRole('textbox', { name: 'Name' }).fill('Bag');
  await form.getByRole('textbox', { name: 'Amount' }).fill('0.20');
  await form.getByRole('button', { name: 'Add to Cart' }).click();
  await expect(form).toHaveCount(0);
}

/** Press near the right end of a row's name (it fills the row's flexible column) and drag `distance` px left in 10 steps, then let go. */
async function dragLeft(page: Page, distance: number, row = page.getByTestId('cart-fee-0'), name = 'Bag') {
  const box = (await row.getByText(name, { exact: true }).boundingBox())!;
  // From the name's middle, a drag past 70 % of a 1280 px row would leave the viewport.
  const x = box.x + box.width - 8;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - distance, y, { steps: 10 });
  await page.mouse.up();
}

test.describe('Cart line strip swipe (PARITY row 3)', () => {
  test('E1: a 100 px drag left opens the strip onto Edit and Remove', async ({ page }) => {
    await addBag(page);
    const row = page.getByTestId('cart-fee-0').getByTestId('cart-line-row');
    // The row's second child is the body that slides; the first is the strip under it.
    const body = row.locator(':scope > *').nth(1);
    const strip = (await row.getByTestId('cart-line-strip-actions').boundingBox())!.width;

    await dragLeft(page, 100);
    await expect(page.getByRole('button', { name: 'Remove Bag' })).toBeVisible();
    await expect.poll(async () => Math.abs((await translateX(body)) + strip), { timeout: 2000 }).toBeLessThanOrEqual(2);
  });

  test('E2: a drag past 70 % of the row removes the line', async ({ page }) => {
    await addBag(page);
    const width = (await page.getByTestId('cart-fee-0').getByTestId('cart-line-row').boundingBox())!.width;

    await dragLeft(page, Math.ceil(width * 0.7) + 1);
    await expect(page.getByTestId('cart-fee-0')).toHaveCount(0);
  });

  test('E5: a quick drag past the strip that holds still before the release opens and keeps the line', async ({ page }) => {
    await addBag(page);
    const box = (await page.getByTestId('cart-fee-0').getByText('Bag', { exact: true }).boundingBox())!;
    const [x, y] = [box.x + box.width - 8, box.y + box.height / 2];
    await page.mouse.move(x, y);
    await page.mouse.down();
    // Two quick moves, not dragLeft's 10 steps: in a local dev run those landed 25-115 ms apart, too slow for a flick (0.8 px/ms) even without the pause.
    const strip = (await page.getByTestId('cart-fee-0').getByTestId('cart-line-strip-actions').boundingBox())!.width;
    const row = (await page.getByTestId('cart-fee-0').getByTestId('cart-line-row').boundingBox())!.width;
    // Short of removePoint (line-strip-geometry.ts): only the flick could remove, and the pause before the release takes it away.
    expect(strip + 20).toBeLessThan(Math.max(strip + 56, Math.round(row * 0.6)));
    await page.mouse.move(x - 20, y);
    await page.mouse.move(x - (strip + 20), y);
    await page.waitForTimeout(300);
    await page.mouse.up();
    await expect(page.getByRole('button', { name: 'Remove Bag' })).toBeVisible();
    await expect(page.getByTestId('cart-fee-0')).toHaveCount(1);
  });

  test('E3: a 100 px drag left on a product line opens the strip onto Remove only', async ({ page }) => {
    await addShirt(page);
    const row = page.getByTestId('cart-line-row').filter({ hasText: 'Shirt' });

    await dragLeft(page, 100, row, 'Shirt');
    await expect(row.getByTestId('cart-line-strip').getByRole('button', { name: 'Remove Shirt' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit Shirt' })).toHaveCount(0);
  });

  test('E4: a drag past 70 % of a product row removes the line', async ({ page }) => {
    await addShirt(page);
    const row = page.getByTestId('cart-line-row').filter({ hasText: 'Shirt' });
    const width = (await row.boundingBox())!.width;

    await dragLeft(page, Math.ceil(width * 0.7) + 1, row, 'Shirt');
    await expect(row).toHaveCount(0);
  });
});
