import { test, expect } from '@playwright/test';

// variationsStyle="drill": a tap on the variable Tee swaps the grid for its variant tiles, the Tee's own tile first
// as Back; each tile's option chips stay inside it; a variant tile adds one line and the drill stays open.
for (const [width, height] of [[390, 844], [1280, 800]] as const) {
  test(`drills into the Tee's variant tiles and back at ${width}x${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.goto('/pos/catalogue-drill');
    await expect(page.getByTestId('catalogue-drill-screen')).toBeVisible();

    await page.getByTestId('product-tile-Tee').click();
    await expect(page.getByTestId('variations-parent-tile')).toBeVisible();
    for (const id of ['81', '82', '83']) await expect(page.getByTestId(`variation-tile-${id}`)).toBeVisible();
    await expect(page.getByTestId('product-tile-Mug')).toHaveCount(0);

    for (const id of ['81', '82', '83']) {
      const tile = await page.getByTestId(`variation-tile-${id}`).boundingBox();
      const chips = await page.getByTestId(`variation-tile-${id}-chips`).boundingBox();
      // The row's own box keeps the tile's width even when its chips overflow, so each chip is measured too.
      const rights = await Promise.all((await page.getByTestId(`variation-tile-${id}-chips`).locator('> *').all())
        .map(async (chip) => { const box = await chip.boundingBox(); return box ? box.x + box.width : Infinity; }));
      expect(tile && chips && rights.length > 0).toBeTruthy();
      console.log(`chips ${width} ${id}: tile right ${tile!.x + tile!.width}, row right ${chips!.x + chips!.width}, chip rights ${rights.join(' ')}`);
      for (const right of [chips!.x + chips!.width, ...rights]) expect(right).toBeLessThanOrEqual(tile!.x + tile!.width + 0.5);
    }
    if (width === 390) await page.screenshot({ path: testInfo.outputPath('catalogue-drill-390.png') });

    const cart = page.getByTestId('catalogue-drill-cart');
    await page.getByTestId('variation-tile-81').click();
    await expect(cart.getByRole('button', { name: /^Decrease / })).toHaveCount(1);
    await expect(page.getByTestId('variation-tile-81')).toBeVisible();

    await page.getByTestId('variations-parent-tile').click();
    await expect(page.getByTestId('product-tile-Mug')).toBeVisible();
    await expect(page.getByTestId('variations-parent-tile')).toHaveCount(0);
  });
}
