import { test, expect } from '@playwright/test';

test.describe('Switch primitive', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/primitives/switch');
  });

  test('clicking toggles switch', async ({ page }) => {
    // The controlled switch starts OFF
    await expect(page.getByText('State: OFF')).toBeVisible();

    // Find the controlled switch (the one next to "Notifications")
    const controlledSwitch = page.getByRole('switch').nth(2);
    await controlledSwitch.click();

    await expect(page.getByText('State: ON')).toBeVisible();

    // Toggle back off
    await controlledSwitch.click();
    await expect(page.getByText('State: OFF')).toBeVisible();
  });

  test('has switch role', async ({ page }) => {
    const switches = page.getByRole('switch');
    await expect(switches.first()).toBeVisible();

    // The default-on switch should have aria-checked=true
    const defaultOn = switches.nth(1);
    await expect(defaultOn).toHaveAttribute('aria-checked', 'true');
  });
});
