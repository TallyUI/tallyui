import { test, expect } from '@playwright/test';

test.describe('CashierSheet demo wiring', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pos/register/cashier');
    await page.getByTestId('register-bar-cashier').click();
    await expect(page.getByTestId('cashier-sheet-store')).toBeVisible();
  });

  test('E1: Switch on the Store row reaches the app', async ({ page }) => {
    await page.getByTestId('cashier-sheet-store-switch').click();
    await expect(page.getByTestId('cashier-sheet-sign-outs')).toHaveText('Last pressed: Switch store');
  });

  test('E2: Switch on the Register row reaches the app', async ({ page }) => {
    await page.getByTestId('cashier-sheet-register-switch').click();
    await expect(page.getByTestId('cashier-sheet-sign-outs')).toHaveText('Last pressed: Switch register');
  });

  test('E3: a hand-to row passes its cashier id', async ({ page }) => {
    await page.getByTestId('cashier-sheet-hand-to-sam').click();
    await expect(page.getByTestId('cashier-sheet-sign-outs')).toHaveText('Last pressed: Hand to sam');
  });

  test('E4: the drawer door reaches the app', async ({ page }) => {
    await page.getByTestId('cashier-sheet-drawer').click();
    await expect(page.getByTestId('cashier-sheet-sign-outs')).toHaveText('Last pressed: Drawer');
  });

  test('E5: Paying holds Switch and shows the payment notice', async ({ page }) => {
    // The open sheet's scrim covers the toggle, so the hold comes from the URL (the toggle is on before the sheet opens).
    await page.goto('/pos/register/cashier?paying=1');
    await page.getByTestId('register-bar-cashier').click();
    await expect(page.getByTestId('cashier-sheet-store-switch')).toBeDisabled();
    await expect(page.getByText('Finish the payment first', { exact: true })).toBeVisible();
  });
});
