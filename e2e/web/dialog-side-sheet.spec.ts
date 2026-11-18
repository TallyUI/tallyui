import { test, expect } from '@playwright/test';

// Desktop Chrome's default size, and the phone size app-shell.spec.ts uses (the sheet is full width there).
const SIZES = [{ width: 1280, height: 720 }, { width: 360, height: 640 }];

for (const size of SIZES) {
  const at = `${size.width}x${size.height}`;

  test.describe(`DialogContent side sheets at ${at}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(size);
      // Reduced motion, so the slide does not move the box while it is measured.
      await page.emulateMedia({ reducedMotion: 'reduce' });
    });

    test('side="left" is anchored to the left edge, full height, and Escape closes it', async ({ page }, testInfo) => {
      await page.goto('/ui/dialog');
      await page.getByTestId('open-left-sheet').click();
      const sheet = page.getByTestId('demo-left-sheet');
      await expect(sheet).toBeVisible();
      await expect.poll(async () => Math.abs((await sheet.boundingBox())!.x), { message: 'left edge' }).toBeLessThanOrEqual(1);
      const box = (await sheet.boundingBox())!;
      expect(Math.abs(box.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.height - size.height)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath(`left-sheet-${at}.png`) });
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
    });

    test('side="right" is still anchored to the right edge', async ({ page }, testInfo) => {
      await page.goto('/ui/dialog');
      await page.getByTestId('open-side-sheet').click();
      const sheet = page.getByTestId('demo-side-sheet');
      await expect(sheet).toBeVisible();
      await expect.poll(async () => {
        const box = (await sheet.boundingBox())!;
        return Math.abs(box.x + box.width - size.width);
      }, { message: 'right edge' }).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath(`right-sheet-${at}.png`) });
      await page.getByTestId('demo-side-sheet-done').click();
      await expect(sheet).toHaveCount(0);
    });

    test("the cart's Order details sheet opens on the left edge", async ({ page }, testInfo) => {
      await page.goto('/pos/sale-note');
      await page.getByRole('button', { name: 'Add Shirt', exact: true }).click();
      await page.getByTestId('cart-foot-more').click();
      await page.getByRole('menuitem', { name: 'Order details' }).click();
      const sheet = page.getByTestId('order-note-sheet');
      await expect(sheet).toBeVisible();
      await expect.poll(async () => Math.abs((await sheet.boundingBox())!.x), { message: 'left edge' }).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath(`order-note-sheet-${at}.png`) });
    });
  });
}
