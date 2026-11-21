import { test, expect } from '@playwright/test';

type Box = { x: number; y: number; width: number; height: number };

/** The overlap of two boxes, or null when they do not overlap. */
function intersect(a: Box, b: Box): Box | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

test.describe('A closing line keypad', () => {
  test('does not swallow the click meant for the next line keypad', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/pos/sale-charges?editor=popover');
    await page.getByRole('button', { name: 'Add Mug' }).click();
    await page.getByRole('button', { name: 'Add Shirt' }).click();

    const shirtTrigger = page.getByRole('button', { name: 'Edit price of Shirt' });
    await expect(shirtTrigger).toBeVisible();
    const shirt = (await shirtTrigger.boundingBox())!;

    await page.getByRole('button', { name: 'Edit price of Mug' }).click();
    const popover = page.getByTestId('price-popover');
    await expect(popover).toBeVisible();

    // Visible before positioned: wait until the keypad leaves (0,0) and sits beside Mug's line, over Shirt's trigger.
    let overlap: Box | null = null;
    await expect.poll(async () => {
      const box = await popover.boundingBox();
      overlap = box ? intersect(box, shirt) : null;
      return overlap ? overlap.width * overlap.height : 0;
    }, { timeout: 5000 }).toBeGreaterThan(0);
    const at = overlap! as Box;

    // At once, while the keypad animates out; locator.click() would wait for the exit to finish.
    await page.keyboard.press('Escape');
    await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);

    await expect(page.getByText('Price for Shirt', { exact: true })).toBeVisible();
  });
});
