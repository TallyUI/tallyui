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
});
