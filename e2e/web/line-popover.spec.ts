import { test, expect, type Locator } from '@playwright/test';

/** A box the same as `before`, give or take a pixel. */
async function expectSameBox(locator: Locator, before: { x: number; y: number; width: number; height: number }) {
  const after = (await locator.boundingBox())!;
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(after[key] - before[key]), key).toBeLessThanOrEqual(1);
  }
}

test.describe('Line price keypad over the till', () => {
  test('opens beside the line at 1280x720 with the till left in place, and applies a quick discount', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/pos/sale-charges?editor=popover');

    const addShirt = page.getByRole('button', { name: 'Add Shirt' });
    await page.getByRole('button', { name: 'Add Mug' }).click();
    await addShirt.click();
    const mug = page.getByText('Mug', { exact: true });
    await expect(mug).toBeVisible();
    const shirtBefore = (await addShirt.boundingBox())!;
    const mugBefore = (await mug.boundingBox())!;

    await page.getByTestId('price-popover-trigger').first().click();
    const popover = page.getByTestId('price-popover');
    await expect(popover).toBeVisible();
    expect(await popover.evaluate((el) => getComputedStyle(el).position)).toBe('absolute');
    await expectSameBox(addShirt, shirtBefore);
    await expectSameBox(mug, mugBefore);
    const box = (await popover.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1280);
    expect(box.y + box.height).toBeLessThanOrEqual(720);
    for (const percent of [5, 10, 15]) await expect(page.getByTestId(`price-discount-${percent}`)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('line-keypad-1280x720.png') });

    await page.getByTestId('price-discount-10').click();
    await page.getByTestId('price-popover-apply').click();
    await expect(popover).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit price of Mug' })).toHaveText('€7.20');
  });
});
