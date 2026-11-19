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

// v2's poster stack (poster-tile/index.tsx:283-291): two cards behind each tile, seen past its right and foot edges,
// and the root footer. The far card's seen edge is its box clipped by every ancestor that clips, so a tile or a
// grid that clips the stack fails here even though the card's own box is unchanged.
for (const [width, height] of [[390, 844], [1280, 800]] as const) {
  test(`category tiles stacked at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/pos/category-browse');
    const tile = page.getByTestId(/^category-tile-pcat_[a-z]+$/).first();
    const id = (await tile.getAttribute('data-testid'))!;
    await expect(page.getByTestId(`${id}-stack`)).toBeVisible();

    const tileBox = (await tile.boundingBox())!;
    const seen = await page.getByTestId(`${id}-stack-far`).evaluate((el) => {
      let { right, bottom } = el.getBoundingClientRect();
      for (let at = el.parentElement; at; at = at.parentElement) {
        const style = getComputedStyle(at);
        const box = at.getBoundingClientRect();
        if (style.overflowX !== 'visible') right = Math.min(right, box.right);
        if (style.overflowY !== 'visible') bottom = Math.min(bottom, box.bottom);
      }
      return { right, bottom };
    });
    const tileRight = tileBox.x + tileBox.width;
    const tileBottom = tileBox.y + tileBox.height;
    expect(seen.right - tileRight, 'the far card shows past the right edge').toBeGreaterThan(5.5);
    expect(seen.right - tileRight).toBeLessThanOrEqual(6.5);
    expect(seen.bottom - tileBottom, 'the far card shows past the foot').toBeGreaterThan(5.5);
    expect(seen.bottom - tileBottom).toBeLessThanOrEqual(6.5);
    const gridBox = (await page.getByTestId('category-browse').boundingBox())!;
    expect(tileRight + 6, 'the grid does not clip the stack').toBeLessThanOrEqual(gridBox.x + gridBox.width);

    await expect(page.getByTestId('category-browse-footer')).toBeVisible();
    await expect(page.getByTestId('category-browse-footer')).toHaveText(/categories · .* products/);
    await page.screenshot({ path: test.info().outputPath(`category-tiles-stacked-${width}.png`) });
  });
}
