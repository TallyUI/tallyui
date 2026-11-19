import { test, expect } from '@playwright/test';

// The phone sale screen: v2's Products / Cart bottom tab bar (pos-phone-tab-bar.tsx), both panes kept mounted.
test.describe('Phone sale at 390x844', () => {
  test('bottom tabs switch between the catalogue and the cart', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/pos/phone-sale');

    const bar = page.getByTestId('pos-tab-bar');
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    expect(Math.abs(box!.y + box!.height - 844)).toBeLessThanOrEqual(2);

    await expect(page.getByTestId('pos-tab-products')).toHaveAttribute('aria-selected', 'true');
    const tile = page.getByTestId('product-tile-Shirt');
    await expect(tile).toBeVisible();
    await tile.click();
    await expect(page.getByTestId('pos-tab-cart-count')).toHaveText('1');

    await page.getByTestId('pos-tab-cart').click();
    await expect(page.getByTestId('pos-tab-cart')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('cart-footer')).toBeVisible();
    await expect(tile).toBeAttached();
    await expect(tile).toBeHidden();

    await page.screenshot({ path: 'docs/v2-parity/screens/tallyui/sale-phone.png' });
  });
});
