import { test, expect } from '@playwright/test';

test.describe('Overlay anchoring', () => {
  test('a Popover inside a centred Dialog opens against its trigger', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    // Reduced motion, so the dialog's scale-in does not move the trigger while it is measured.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/ui/dialog');

    await page.getByRole('button', { name: 'Open dialog with a popover', exact: true }).click();
    await expect(page.getByRole('dialog').filter({ hasText: 'Dialog with a popover' })).toBeVisible();

    const trigger = page.getByRole('button', { name: 'Open nested popover', exact: true });
    await trigger.click();
    const content = page.getByRole('dialog').filter({ hasText: 'Nested Popover Content' });
    await expect(content).toBeVisible();

    const boxes = async () => ({ t: (await trigger.boundingBox())!, c: (await content.boundingBox())! });
    // Soft, so a miss on y still reports x and still logs the boxes and saves the screenshot.
    const soft = expect.configure({ soft: true });
    // The position is applied after an async measure, so poll for it.
    // Top is the trigger's bottom plus sideOffset 4 (PopoverContent's default).
    await soft
      .poll(async () => {
        const { t, c } = await boxes();
        return Math.abs(c.y - (t.y + t.height + 4));
      }, { message: 'content top vs trigger bottom + 4' })
      .toBeLessThanOrEqual(2);
    // Centres line up (PopoverContent's default align="center").
    await soft
      .poll(async () => {
        const { t, c } = await boxes();
        return Math.abs(c.x + c.width / 2 - (t.x + t.width / 2));
      }, { message: 'content centre vs trigger centre' })
      .toBeLessThanOrEqual(2);

    const { t, c } = await boxes();
    console.log('trigger', JSON.stringify(t), 'content', JSON.stringify(c));
    await page.screenshot({ path: testInfo.outputPath('popover-in-dialog-1280x800.png') });
  });
});
