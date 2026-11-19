import { test, expect } from '@playwright/test';

// The shared category breadcrumb (v2 packages/components/src/breadcrumb/index.tsx): opening a category by its tile
// focuses the crumb, the place wraps inside the row, the separator shows only at wide widths, and Escape goes back.
for (const [width, height] of [[390, 844], [1280, 800]] as const) {
  test(`category breadcrumb at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/pos/category-browse');
    await expect(page.getByTestId('category-browse-screen')).toBeVisible();
    await page.getByTestId('category-tile-pcat_ceramics').click();

    const root = page.getByTestId('category-crumb-root');
    await expect(root).toBeFocused();

    const sep = page.getByTestId('category-crumb-sep-0');
    if (width === 390) await expect(sep).toHaveCount(0);
    else await expect(sep).toBeVisible();

    const row = page.getByTestId('category-crumb');
    const here = page.getByTestId('category-crumb-here');
    await expect(here).toHaveText('Hand-thrown stoneware mugs, jugs and serving bowls from the studio');
    const rowBox = (await row.boundingBox())!;
    const hereBox = (await here.boundingBox())!;
    expect(hereBox.x + hereBox.width, 'the place stays inside the crumb row').toBeLessThanOrEqual(rowBox.x + rowBox.width + 0.5);
    if (width === 390) {
      // The computed line-height; where it is `normal` (RN-web Text sets none), the rendered height of the first
      // character, which is one line's height.
      const lineHeight = await here.evaluate((el) => {
        const computed = parseFloat(getComputedStyle(el).lineHeight);
        if (Number.isFinite(computed)) return computed;
        const range = document.createRange();
        range.setStart(el.firstChild!, 0);
        range.setEnd(el.firstChild!, 1);
        return range.getBoundingClientRect().height;
      });
      expect(lineHeight, 'one line has a height').toBeGreaterThan(0);
      expect(hereBox.height, 'the place wraps at 390').toBeGreaterThan(1.5 * lineHeight);
    }
    await page.screenshot({ path: test.info().outputPath(`category-crumb-${width}.png`) });

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('category-browse')).toBeVisible();
    await expect(row).toHaveCount(0);
  });
}
