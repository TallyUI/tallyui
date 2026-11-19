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

// The track lays its thumb out in a row (v2 parity): off at the left edge, on at the right edge.
test.describe('Switch (components) thumb position', () => {
  const boxes = async (track: import('@playwright/test').Locator) => {
    const t = await track.boundingBox();
    const h = await track.locator(':scope > *').first().boundingBox();
    if (!t || !h) throw new Error('no bounding box');
    return { t, h };
  };

  test('S1: an unchecked thumb sits at the left edge, centred vertically', async ({ page }) => {
    await page.goto('/pos/settings-group');
    const track = page.getByRole('switch').first();
    await expect(track).toBeVisible();
    const { t, h } = await boxes(track);
    expect(Math.abs(h.x - t.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(h.y + h.height / 2 - (t.y + t.height / 2))).toBeLessThanOrEqual(2);
  });

  // /pos/settings-group's Switches are uncontrolled, so their thumb class never changes; /ui/switch's Basic one is controlled.
  test('S2: a checked thumb sits at the right edge', async ({ page }) => {
    await page.goto('/ui/switch');
    const track = page.getByRole('switch').first();
    await track.click();
    await expect(track).toHaveAttribute('aria-checked', 'true');
    await page.waitForTimeout(300);
    const { t, h } = await boxes(track);
    expect(Math.abs(t.x + t.width - (h.x + h.width))).toBeLessThanOrEqual(3);
  });
});
