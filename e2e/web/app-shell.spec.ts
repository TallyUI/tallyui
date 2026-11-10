import { test, expect } from '@playwright/test';

// The app shell's one layout boundary (v2 device.ts): 768 wide and 480 tall gets the rail.
test.describe('AppShell at 1280x800', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/pos/app-shell');
  });

  test('shows the rail, navigates, and labels an item on hover', async ({ page }) => {
    const rail = page.getByRole('navigation', { name: 'Main' });
    await expect(rail).toBeVisible();
    await expect(page.getByTestId('register-bar-name')).toHaveText('Demo Store · Front counter');
    await expect(page.getByTestId('register-bar-menu')).toHaveCount(0);
    await expect(page.getByTestId('nav-item-pos')).toHaveAttribute('aria-current', 'page');

    await page.getByTestId('nav-item-orders').click();
    await expect(page.getByTestId('app-shell-page')).toHaveText('Orders');
    await expect(page.getByTestId('nav-item-orders')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('nav-item-pos')).not.toHaveAttribute('aria-current', 'page');

    await page.getByTestId('nav-item-customers').hover();
    await expect(page.getByTestId('nav-rail-label-customers')).toHaveText('Customers');
    // Settings sits in the bottom group, at the foot of the rail.
    const settings = await page.getByTestId('nav-item-settings').boundingBox();
    expect(settings!.y).toBeGreaterThan(600);
  });
});

test.describe('AppShell at 360x640', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/pos/app-shell');
  });

  test('has no rail and opens the drawer from the menu', async ({ page }) => {
    await expect(page.getByTestId('nav-rail')).toHaveCount(0);
    await page.getByTestId('register-bar-menu').click();
    const panel = page.getByRole('dialog', { name: 'Menu' });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('navigation', { name: 'Main' })).toBeVisible();
    await expect(page.getByTestId('nav-item-pos')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('nav-drawer')).toHaveCount(0);
    await expect(page.getByTestId('register-bar-menu')).toBeFocused();
  });

  test('closes on a backdrop press and navigates from an item', async ({ page }) => {
    await page.getByTestId('register-bar-menu').click();
    await expect(page.getByTestId('nav-drawer-panel')).toBeVisible();
    await page.mouse.click(320, 320);
    await expect(page.getByTestId('nav-drawer')).toHaveCount(0);

    await page.getByTestId('register-bar-menu').click();
    await page.getByTestId('nav-item-products').click();
    await expect(page.getByTestId('nav-drawer')).toHaveCount(0);
    await expect(page.getByTestId('app-shell-page')).toHaveText('Products');
  });
});
