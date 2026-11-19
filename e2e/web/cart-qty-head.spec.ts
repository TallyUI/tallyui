import { test, expect, type Locator } from '@playwright/test';

// The cart's Qty head at phone width: in every scale step its label is not ellipsized (Q2) and it sits over the
// line's quantity (Q3). An auto ScaleProvider resolves to compact under 640 wide, the narrowest Qty column.
const centre = async (locator: Locator) => {
  const box = (await locator.boundingBox())!;
  return box.x + box.width / 2;
};

test.describe('Cart Qty head at 390x844', () => {
  for (const step of ['compact', 'regular', 'spacious'] as const) {
    test(`fits and centres over the quantity at scale ${step}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/pos/phone-sale?scale=${step}`);
      await page.getByTestId('product-tile-Shirt').click();
      await page.getByTestId('pos-tab-cart').click();

      const head = page.getByRole('columnheader', { name: 'Qty' });
      await expect(head).toBeVisible();
      // The Text with numberOfLines, the element the browser ellipsizes.
      const label = head.getByText('Qty', { exact: true });
      const { scrollWidth, clientWidth } = await label.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
      expect(scrollWidth, 'Q2: the Qty label is not truncated').toBeLessThanOrEqual(clientWidth);

      // The line's name cell, as sale-charges.spec.ts finds it; the quantity cell is the column before it.
      const name = page.getByText('Shirt', { exact: true }).filter({ visible: true }).locator('xpath=..');
      const quantity = name.locator('xpath=preceding-sibling::*[1]/*[1]');
      await expect(quantity).toHaveText('1');
      expect(Math.abs(await centre(label) - await centre(quantity)), 'Q3: the Qty head centres over the quantity').toBeLessThanOrEqual(1);

      await page.screenshot({ path: test.info().outputPath(`qty-head-${step}.png`) });
    });
  }
});
