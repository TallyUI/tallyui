import { test, expect, type Locator, type Page } from '@playwright/test';

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error('element has no bounding box');
  return rect;
}

/** Presses the thumb at its centre and drags it, with the mouse, to `x` on the root's vertical centre. */
async function dragThumbTo(page: Page, thumb: Locator, x: number) {
  const start = await box(thumb);
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, start.y + start.height / 2, { steps: 10 });
  await page.mouse.up();
}

const volume = async (page: Page) =>
  Number((await page.getByText(/^Volume: \d+%$/).textContent())?.match(/\d+/)?.[0]);

test.describe('Slider', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ui/slider');
    await expect(page.getByText('Volume: 50%')).toBeVisible();
  });

  test('dragging the thumb sets the value', async ({ page }) => {
    const thumb = page.getByRole('slider').first();
    const root = await box(thumb.locator('..'));
    const before = await box(thumb);

    await dragThumbTo(page, thumb, root.x + root.width - 2);
    await expect.poll(() => volume(page)).toBeGreaterThan(90);
    const right = await box(thumb);
    expect(right.x).toBeGreaterThan(before.x + root.width * 0.35);

    await dragThumbTo(page, thumb, root.x + 2);
    await expect.poll(() => volume(page)).toBeLessThan(10);
    const left = await box(thumb);
    expect(left.x).toBeLessThan(before.x - root.width * 0.35);
  });

  test('arrow keys and End change the focused value', async ({ page }) => {
    const thumb = page.getByRole('slider').first();
    await thumb.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText('Volume: 53%')).toBeVisible();
    await page.keyboard.press('End');
    await expect(page.getByText('Volume: 100%')).toBeVisible();
  });

  test('dragging the disabled slider leaves its value', async ({ page }) => {
    const thumb = page.getByRole('slider').nth(4);
    await expect(thumb).toHaveAttribute('aria-valuenow', '40');
    const root = await box(thumb.locator('..'));

    await dragThumbTo(page, thumb, root.x + root.width - 2);
    await expect(thumb).toHaveAttribute('aria-valuenow', '40');
  });
});
