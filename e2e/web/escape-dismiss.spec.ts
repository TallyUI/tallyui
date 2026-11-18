import { test, expect } from '@playwright/test';

test.describe('Escape dismiss', () => {
  test('E1: Escape closes an open Select', async ({ page }) => {
    await page.goto('/ui/select');
    await page.getByText('Pick a fruit', { exact: true }).click();
    await expect(page.getByText('Banana', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Banana', { exact: true })).not.toBeVisible();
  });

  test('E2: Escape closes an open DropdownMenu', async ({ page }) => {
    await page.goto('/ui/dropdown-menu');
    await page.getByText('Open Menu', { exact: true }).click();
    await expect(page.getByText('Profile', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Profile', { exact: true })).not.toBeVisible();
  });

  test('E3: Escape closes the open sub menu first, then the menu', async ({ page }) => {
    await page.goto('/ui/dropdown-menu');
    await page.getByText('Actions', { exact: true }).click();
    await page.getByText('Share via...', { exact: true }).click();
    await expect(page.getByText('Slack', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Slack', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Paste', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Paste', { exact: true })).not.toBeVisible();
  });

  test('E4: Escape closes an open Combobox list', async ({ page }) => {
    await page.goto('/ui/combobox');
    await page.getByPlaceholder('Search frameworks...', { exact: true }).click();
    await expect(page.getByText('Qwik', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Qwik', { exact: true })).not.toBeVisible();
  });

  test.describe('Overlays in a Dialog', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/ui/dialog');
      await page.getByRole('button', { name: 'Open dialog with overlays', exact: true }).click();
    });

    test('E5: Escape closes the nested Select first, then the Dialog', async ({ page }) => {
      await page.getByTestId('nested-select-trigger').click();
      await expect(page.getByTestId('nested-select-content')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('nested-select-content')).not.toBeVisible();
      await expect(page.getByPlaceholder('Nested combobox', { exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByPlaceholder('Nested combobox', { exact: true })).not.toBeVisible();
    });

    test('E6: Escape in the focused nested Combobox input closes only its list', async ({ page }) => {
      await page.getByPlaceholder('Nested combobox', { exact: true }).click();
      await expect(page.getByText('One', { exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByText('One', { exact: true })).not.toBeVisible();
      await expect(page.getByPlaceholder('Nested combobox', { exact: true })).toBeVisible();
    });

    test('E7: Escape closes the nested DropdownMenu and leaves the Dialog open', async ({ page }) => {
      await page.getByTestId('nested-dropdown-menu-trigger').click();
      await expect(page.getByText('Nested menu item', { exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByText('Nested menu item', { exact: true })).not.toBeVisible();
      await expect(page.getByPlaceholder('Nested combobox', { exact: true })).toBeVisible();
    });
  });
});
