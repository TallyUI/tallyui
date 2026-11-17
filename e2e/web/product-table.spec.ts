import { test, expect } from '@playwright/test';

test.describe('Product table row extras', () => {
  test('leads rows with thumbnails and adds once from the row + at 1280x800', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/pos/product-table');

    await expect(page.getByTestId(/^product-row-\w+$/)).toHaveCount(3);
    await expect(page.getByTestId('product-row-shirt').locator('img')).toHaveCount(1);

    const cart = page.getByTestId('product-table-cart');
    await page.getByTestId('product-row-shirt').getByRole('button', { name: 'Add to cart' }).click();
    await expect(cart.getByRole('button', { name: 'Decrease Shirt' })).toHaveCount(1);
    await expect(cart.getByText('1', { exact: true })).toHaveCount(1);
    await expect(cart.getByText('2', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Choose variant')).toHaveCount(0);

    await page.getByTestId('product-row-hoodie').getByRole('button', { name: 'Variations' }).click();
    const chooser = page.getByLabel('Choose variant');
    await expect(chooser).toBeVisible();
    await expect(chooser.getByText('S', { exact: true })).toBeVisible();
    await expect(chooser.getByText('M', { exact: true })).toBeVisible();
  });
});
