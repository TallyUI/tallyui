import { test, expect } from '@playwright/test';

test.describe('Tabs primitive', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/primitives/tabs');
  });

  test('clicking a tab changes content', async ({ page }) => {
    // First tab is active by default
    await expect(page.getByText('First Tab', { exact: true })).toBeVisible();
    await expect(page.getByText('Second Tab', { exact: true })).not.toBeVisible();

    // Click second tab trigger
    await page.getByRole('tab', { name: 'Tab 2' }).click();
    await expect(page.getByText('Second Tab', { exact: true })).toBeVisible();
    await expect(page.getByText('First Tab', { exact: true })).not.toBeVisible();

    // Click third tab trigger
    await page.getByRole('tab', { name: 'Tab 3' }).click();
    await expect(page.getByText('Third Tab', { exact: true })).toBeVisible();
    await expect(page.getByText('Second Tab', { exact: true })).not.toBeVisible();
  });

  test('tabs have proper ARIA roles', async ({ page }) => {
    // Tab list
    await expect(page.getByRole('tablist')).toBeVisible();

    // Individual tabs
    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(3);

    // Active tab should have aria-selected=true
    await expect(page.getByRole('tab', { name: 'Tab 1' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'Tab 2' })).toHaveAttribute('aria-selected', 'false');

    // Tab panel
    await expect(page.getByRole('tabpanel')).toBeVisible();
  });
});
