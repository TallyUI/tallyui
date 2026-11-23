import { test, expect, type Page } from '@playwright/test';

// Row 514: Back on a sale that took money opens WCPOS v2's cancel-payment view (ADR-072 d3, amended 2026-11-22). It lists the
// cash to return, Keep taking payment closes it, and Cancel and void voids the leg and returns to the cart, the leg kept as voided.
test.describe('Cancel payment at 1280x800', () => {
  const keyIn = async (page: Page, digits: string) => {
    await page.getByTestId('tender-keypad-key-clear').click();
    for (const digit of digits) await page.getByTestId(`tender-keypad-key-${digit}`).click();
  };

  test('Back lists the cash to return, then Cancel and void returns to the cart', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/pos/split-sale');

    await page.getByTestId('product-tile-Shirt').click();
    await page.getByTestId('cart-checkout').click();
    const ledger = page.getByTestId('cart-payments');
    const total = await ledger.getByTestId('tender-ledger-remaining').textContent();
    expect(total).toMatch(/^€\d+\.\d\d$/);

    await keyIn(page, '500');
    await expect(page.getByTestId('tender-entry-amount')).toHaveText('€5.00');
    await page.getByTestId('tender-take').click();

    const column = page.getByTestId('pos-checkout-column');
    await column.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByTestId('tender-cancel-view')).toBeVisible();
    await expect(page.locator('[data-testid^="tender-cancel-leg-"]')).toHaveText(['Return €5.00 cash to the customer']);

    await page.getByTestId('tender-cancel-keep').click();
    await expect(page.getByTestId('tender-cancel-view')).toBeHidden();
    await expect(page.getByTestId('tender-take')).toBeVisible();

    await column.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByTestId('tender-cancel-view')).toBeVisible();
    await page.screenshot({ path: 'docs/v2-parity/screens/tallyui/tender-cancel-payment.png' });
    await page.getByTestId('tender-cancel-confirm').click();
    await expect(column).toBeHidden();
    await expect(page.getByTestId('product-tile-Shirt')).toBeVisible();

    await page.getByTestId('cart-checkout').click();
    await expect(ledger.locator('[data-testid^="tender-leg-"][data-testid$="-status"]')).toHaveText(['Cancelled']);
    await expect(ledger.getByTestId('tender-ledger-remaining')).toHaveText(total!);
  });
});
