import { test, expect } from '@playwright/test';

// A closes and B opens in one press, so B opens while A is still animating out.
test.describe('Switching from one dialog to the next', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ui/dialog');
    await page.getByRole('button', { name: 'Open switch A', exact: true }).click();
    await expect(page.getByText('Switch A', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Open B', exact: true }).click();
  });

  test('K3a: text typed into B at once is still there after A has left', async ({ page }) => {
    await page.getByTestId('switch-b-note').fill('typed');
    await page.waitForTimeout(1000);
    await expect(page.getByTestId('switch-b-note')).toHaveValue('typed');
  });

  test('K3b: Escape on B during A\'s exit leaves no dialog behind, and A opens again', async ({ page }) => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Open switch A', exact: true }).click();
    await expect(page.getByText('Switch A', { exact: true })).toBeVisible();
  });
});
