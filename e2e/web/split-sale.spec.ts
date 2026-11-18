import { test, expect } from '@playwright/test';

// The split sale screen: v2's checkout column (pos-columns.tsx:118-162). At tender the checkout pane takes the products
// column's place, the catalogue unmounts, and the cart stays on the right as the Payments ledger.
test.describe('Split sale at 1280x800', () => {
  test('checkout takes the products column and the cart becomes the ledger', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/pos/split-sale');

    const tile = page.getByTestId('product-tile-Shirt');
    await tile.click();
    await page.getByTestId('cart-checkout').click();

    const column = page.getByTestId('pos-checkout-column');
    await expect(column).toBeVisible();
    await expect(tile).not.toBeAttached();

    const ledger = page.getByTestId('cart-payments');
    await expect(ledger).toBeVisible();
    const columnBox = await column.boundingBox();
    const ledgerBox = await ledger.boundingBox();
    expect(columnBox!.x + columnBox!.width).toBeLessThanOrEqual(ledgerBox!.x + 1);

    await page.screenshot({ path: 'docs/v2-parity/screens/tallyui/tender-checkout-column.png' });
  });
});
