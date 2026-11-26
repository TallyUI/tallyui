import { test, expect, type Locator, type Page } from '@playwright/test';

/** The computed translateX of an element, from its `matrix(a, b, c, d, tx, ty)` (or `none`, at rest). */
async function translateX(element: Locator) {
  const transform = await element.evaluate((node) => getComputedStyle(node).transform);
  return transform === 'none' ? 0 : Number(transform.match(/^matrix\((.+)\)$/)![1].split(',')[4]);
}

async function addBag(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/pos/sale-charges');
  await page.getByRole('button', { name: 'Add Shirt' }).click();
  await page.getByRole('button', { name: 'Add charge', exact: true }).click();
  const form = page.getByTestId('charge-form');
  await form.getByRole('button', { name: 'Fee', exact: true }).click();
  await form.getByRole('textbox', { name: 'Name' }).fill('Bag');
  await form.getByRole('textbox', { name: 'Amount' }).fill('0.20');
  await form.getByRole('button', { name: 'Add to Cart' }).click();
  await expect(form).toHaveCount(0);
}

/** Press near the right end of the fee row's name (it fills the row's flexible column) and drag `distance` px left in 10 steps, then let go. */
async function dragLeft(page: Page, distance: number) {
  const box = (await page.getByTestId('cart-fee-0').getByText('Bag', { exact: true }).boundingBox())!;
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
});
