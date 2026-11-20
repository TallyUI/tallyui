import { test, expect, type Page } from '@playwright/test';

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

  // The demo's settings: EUR, prices exclude tax, 25% default rate. Shirt is €12.50 net, so two Shirts are €25.00 net plus
  // €6.25 tax, €31.25; one Mug is €8.00 plus €2.00, €10.00; the sale is €41.25. One of the two Shirts is
  // floor(3125 × 1 / 2) = 1562 minor (split-units.ts unitsMinor), €15.62; what is left is €41.25 − €15.62 = €25.63.
  const SHIRT_PICK = '€15.62';
  const REMAINING = '€25.63';

  /** Shirt twice and Mug once, check out, press Split, pick one Shirt. */
  async function pickOneShirt(page: Page) {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/pos/split-sale');
    await page.getByTestId('product-tile-Shirt').click();
    await page.getByTestId('product-tile-Shirt').click();
    await page.getByTestId('product-tile-Mug').click();
    await page.getByTestId('cart-checkout').click();
    await page.getByTestId('tender-split-chip').click();
    await expect(pickUnits(page)).toHaveText(['0 of 2', '0 of 1']);
    await page.getByRole('button', { name: /^One more Shirt/ }).click();
    await expect(pickUnits(page)).toHaveText(['1 of 2', '0 of 1']);
    await expect(page.locator('[data-testid^="cart-line-"][data-testid$="-pick-amount"]')).toHaveText([SHIRT_PICK]);
    await expect(page.getByTestId('tender-entry-amount')).toHaveText(SHIRT_PICK);
    await expect(page.getByRole('columnheader').first()).toHaveText('This payment');
  }
  const pickUnits = (page: Page) => page.locator('[data-testid^="cart-line-"][data-testid$="-pick-units"]');
  const keyIn = async (page: Page, digits: string) => {
    await page.getByTestId('tender-keypad-key-clear').click();
    for (const digit of digits) await page.getByTestId(`tender-keypad-key-${digit}`).click();
  };

  test('pays a split sale by item', async ({ page }) => {
    await pickOneShirt(page);
    await page.screenshot({ path: 'docs/v2-parity/screens/tallyui/tender-split-picker/after-light.png' });

    // A card entry one cent under the pick is refused; the exact chip takes it.
    await page.getByTestId('tender-method-external').click();
    await keyIn(page, '1561');
    await expect(page.getByTestId('tender-entry-amount')).toHaveText('€15.61');
    await expect(page.getByTestId('tender-take')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('tender-entry-hint')).toHaveText(`This payment is ${SHIRT_PICK} for the picked items`);
    await page.getByTestId('tender-quick-balance').click();
    await expect(page.getByTestId('tender-entry-amount')).toHaveText(SHIRT_PICK);
    await expect(page.getByTestId('tender-take')).not.toHaveAttribute('aria-disabled', 'true');
    await page.getByTestId('tender-take').click();

    const ledger = page.getByTestId('cart-payments');
    const legs = ledger.locator('[data-testid^="tender-leg-"][data-testid$="-status"]');
    await expect(legs).toHaveCount(1);
    await expect(legs).toHaveText(['Captured']);
    await expect(ledger.getByTestId('tender-ledger')).toContainText(SHIRT_PICK);
    await expect(ledger.getByTestId('tender-ledger-remaining')).toHaveText(REMAINING);
    await page.getByTestId('tender-split-chip').click();
    await expect(pickUnits(page)).toHaveText(['0 of 1', '0 of 1']);

    // The rest in cash, all remaining units picked, at a chip above it: the headline shows change.
    await page.getByRole('button', { name: /^One more Shirt/ }).click();
    await page.getByRole('button', { name: /^One more Mug/ }).click();
    await page.getByTestId('tender-method-cash').click();
    await page.getByTestId('tender-quick-3000').click();
    await expect(page.getByTestId('tender-entry-hint')).toHaveText('Change €4.37');
    await page.getByTestId('tender-take').click();
    await expect(page.getByTestId('tender-change')).toHaveText('Change €4.37');
    await expect(ledger.getByTestId('tender-ledger-lead')).toContainText('Paid in full');
    await page.getByTestId('tender-complete').click();
    await expect(page.getByTestId('sale-receipt')).toBeVisible();
  });

  test('pays a split sale by item, dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await pickOneShirt(page);
    await page.screenshot({ path: 'docs/v2-parity/screens/tallyui/tender-split-picker/after-dark.png' });
  });
});
