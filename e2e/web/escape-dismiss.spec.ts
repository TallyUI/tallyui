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
});
