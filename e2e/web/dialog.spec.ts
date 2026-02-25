import { test, expect } from '@playwright/test';

test.describe('Dialog primitive', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/primitives/dialog');
  });

  test('trigger opens dialog', async ({ page }) => {
    await page.getByText('Open Uncontrolled Dialog').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('This dialog manages its own open/close state internally.')).toBeVisible();
  });

  test('close button closes dialog', async ({ page }) => {
    await page.getByText('Open Uncontrolled Dialog').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Click the Close button inside the dialog
    await page.getByRole('dialog').getByText('Close').click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('dialog content has proper ARIA role', async ({ page }) => {
    await page.getByText('Open Uncontrolled Dialog').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-labelledby');
  });
});
