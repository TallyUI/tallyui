import { test, expect } from '@playwright/test';

test.describe('Popover dismiss', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ui/popover');
    await page.getByText('Open Popover', { exact: true }).click();
    await expect(page.getByText('Popover Content', { exact: true })).toBeVisible();
  });

  test('P1: Escape closes the popover', async ({ page }) => {
    await page.keyboard.press('Escape');
    await expect(page.getByText('Popover Content', { exact: true })).not.toBeVisible();
  });

  test('P2: a click outside closes the popover', async ({ page }) => {
    await page.getByText('Basic Popover', { exact: true }).click();
    await expect(page.getByText('Popover Content', { exact: true })).not.toBeVisible();
  });

  test('P3: a click inside keeps the popover open', async ({ page }) => {
    await page.getByText('Popover Content', { exact: true }).click();
    await expect(page.getByText('Popover Content', { exact: true })).toBeVisible();
  });

  test('P4: a click on the trigger toggles it closed', async ({ page }) => {
    await page.getByText('Open Popover', { exact: true }).click();
    await page.waitForTimeout(300);
    await expect(page.getByText('Popover Content', { exact: true })).not.toBeVisible();
  });

  test('P5: the content is absolute beside its trigger and leaves the screen its full height', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    // The beforeEach opened it; close it to record the page without it, then open it again.
    await page.keyboard.press('Escape');
    await expect(page.getByText('Popover Content', { exact: true })).not.toBeVisible();
    const controlled = page.getByText('Controlled Popover', { exact: true });
    const before = await controlled.boundingBox();
    const trigger = page.getByText('Open Popover', { exact: true });
    await trigger.click();

    const content = page.getByRole('dialog').filter({ hasText: 'Popover Content' });
    await expect(content).toBeVisible();
    expect(await content.evaluate((el) => getComputedStyle(el).position)).toBe('absolute');
    const triggerBox = (await page.getByRole('button', { name: 'Open Popover', exact: true }).boundingBox())!;
    const contentBox = (await content.boundingBox())!;
    const gap = contentBox.y - (triggerBox.y + triggerBox.height);
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(16);
    expect(await controlled.boundingBox()).toEqual(before);
  });
});
