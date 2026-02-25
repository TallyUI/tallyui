import { test, expect } from '@playwright/test';

test.describe('Checkbox primitive', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/primitives/checkbox');
  });

  test('clicking toggles checked state', async ({ page }) => {
    // The controlled checkbox starts unchecked
    await expect(page.getByText('State: UNCHECKED')).toBeVisible();

    // Find the controlled checkbox (the one next to "Enable notifications")
    const controlledCheckbox = page.getByRole('checkbox').nth(2);
    await controlledCheckbox.click();

    await expect(page.getByText('State: CHECKED')).toBeVisible();

    // Click again to uncheck
    await controlledCheckbox.click();
    await expect(page.getByText('State: UNCHECKED')).toBeVisible();
  });

  test('has checkbox role', async ({ page }) => {
    const checkboxes = page.getByRole('checkbox');
    // There are multiple checkboxes: uncontrolled (unchecked), uncontrolled (default checked),
    // controlled, disabled unchecked, disabled checked
    await expect(checkboxes.first()).toBeVisible();

    // The default-checked checkbox should have aria-checked=true
    const defaultChecked = checkboxes.nth(1);
    await expect(defaultChecked).toHaveAttribute('aria-checked', 'true');
  });
});
