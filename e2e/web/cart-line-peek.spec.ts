import { test, expect, type Locator } from '@playwright/test';

/** The computed translateX of an element, from its `matrix(a, b, c, d, tx, ty)` (or `none`, at rest). */
async function translateX(element: Locator) {
  const transform = await element.evaluate((node) => getComputedStyle(node).transform);
  return transform === 'none' ? 0 : Number(transform.match(/^matrix\((.+)\)$/)![1].split(',')[4]);
}

test.describe('Cart line strip (refill r4 13b)', () => {
  test('hovering a line\'s Total peeks the row 16 px left, and hovering out brings it home', async ({ page }) => {
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

    // The row's second child is the body that slides; the first is the strip under it.
    const body = page.getByTestId('cart-fee-0').getByTestId('cart-line-row').locator(':scope > *').nth(1);
    expect(await translateX(body)).toBe(0);

    await page.getByRole('button', { name: 'Edit total of Bag', exact: true }).hover();
    await expect.poll(() => translateX(body), { timeout: 1000 }).toBeCloseTo(-16, 0);

    await page.mouse.move(0, 0);
    await expect.poll(() => translateX(body)).toBeCloseTo(0, 0);
    // A peek opens nothing: the strip's buttons stay hidden.
    await expect(page.getByRole('button', { name: 'Remove Bag' })).toHaveCount(0);
  });
});
