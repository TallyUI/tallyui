import { test, expect, type Locator, type Page } from '@playwright/test';

const sizes = [
  { width: 360, height: 640 },
  { width: 1280, height: 800 },
];

/** A formatted amount ("€12.50") in minor units. */
const minor = (text: string) => Math.round(Number(text.replace(/[^\d.-]/g, '')) * 100);

/** The amount printed beside a label in the cart's rows (a CartTotal row, or a CartLine's name and its total). */
async function amountBeside(label: Locator) {
  return minor(await label.locator('xpath=following-sibling::*[1]').innerText());
}

async function addCharge(page: Page, kind: 'Fee' | 'Shipping' | 'Custom item', name: string, amount: string, noTax = false) {
  await page.getByRole('button', { name: 'Add charge', exact: true }).click();
  const form = page.getByTestId('charge-form');
  await form.getByRole('button', { name: kind, exact: true }).click();
  await form.getByRole('textbox', { name: 'Name' }).fill(name);
  await form.getByRole('textbox', { name: 'Amount' }).fill(amount);
  if (noTax) await form.getByRole('switch', { name: 'No tax' }).click();
  await form.getByRole('button', { name: 'Apply' }).click();
  await expect(form).toHaveCount(0);
}

test.describe('Cart charges (order.create 5)', () => {
  for (const size of sizes) {
    test(`adds a fee, shipping and a custom item, removes the fee, and prints shipping on the receipt at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/pos/sale-charges');

      await page.getByRole('button', { name: 'Add Shirt' }).click();
      await addCharge(page, 'Fee', 'Bag', '0.20');
      await addCharge(page, 'Shipping', 'Delivery', '5.00');
      await addCharge(page, 'Custom item', 'Gift wrap', '3.00', true);

      await expect(page.getByTestId('cart-fee-0')).toContainText('Bag');
      await expect(page.getByTestId('cart-fee-0')).toContainText('€0.20');
      await expect(page.getByTestId('cart-shipping-0')).toContainText('Delivery');
      await expect(page.getByTestId('cart-shipping-0')).toContainText('€5.00');
      await expect(page.getByText('Gift wrap', { exact: true })).toBeVisible();

      // Total = the product's line + 0.20 + 5.00 + 3.00 + the tax rows the footer shows (prices exclude tax).
      const footer = page.getByTestId('cart-footer');
      const shirt = await amountBeside(page.getByText('Shirt', { exact: true }).locator('xpath=..'));
      const taxLabels = await footer.getByText(/^Tax \d/).all();
      expect(taxLabels.length).toBeGreaterThan(0);
      let tax = 0;
      for (const label of taxLabels) tax += await amountBeside(label);
      // The fixture's one rate, 25%, on the shirt, the fee and the shipping; the "No tax" custom item adds none.
      expect(Math.abs(tax - 0.25 * (shirt + 20 + 500))).toBeLessThanOrEqual(1);
      const total = await amountBeside(footer.getByText('Total', { exact: true }));
      expect(total).toBe(shirt + 20 + 500 + 300 + tax);

      await page.getByRole('button', { name: 'Remove Bag' }).click();
      await expect(page.getByTestId('cart-fee-0')).toHaveCount(0);
      await expect(page.getByTestId('cart-shipping-0')).toContainText('Delivery');

      const due = await footer.getByText('Total', { exact: true }).locator('xpath=following-sibling::*[1]').innerText();
      await footer.getByRole('button', { name: 'Cash', exact: true }).click();
      // The first quick amount is the exact total.
      await page.getByText(due, { exact: true }).first().click();
      await page.getByRole('button', { name: 'Complete sale' }).click();

      const receipt = page.getByTestId('sale-receipt');
      const delivery = receipt.getByLabel(/^Delivery: /);
      const subtotal = receipt.getByLabel(/^Subtotal: /);
      const receiptTotal = receipt.getByLabel(/^Total: /);
      await expect(delivery).toHaveAttribute('aria-label', 'Delivery: €5.00');
      await expect(subtotal).toBeVisible();
      await expect(receiptTotal).toBeVisible();
      await expect(receipt.getByLabel(/^Bag: /)).toHaveCount(0);
      expect((await delivery.boundingBox())!.y).toBeGreaterThan((await subtotal.boundingBox())!.y);
      expect((await delivery.boundingBox())!.y).toBeLessThan((await receiptTotal.boundingBox())!.y);
    });
  }
});

test.describe('Cart charges (order.create 4)', () => {
  for (const size of sizes) {
    test(`offers no Add charge at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/pos/sale-charges?v=4');

      await page.getByRole('button', { name: 'Add Shirt' }).click();
      await expect(page.getByRole('button', { name: 'Order discount' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Add charge', exact: true })).toHaveCount(0);
    });
  }
});
