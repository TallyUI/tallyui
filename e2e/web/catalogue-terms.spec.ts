import { test, expect, type Page } from '@playwright/test';

// termPills: a pill per term group (Brand, Colour) after the chips; a pick narrows the grid, picks in two groups AND
// together, each pill's x clears its pick, and a pill's search filters its terms.
const NAMES = ['Shirt', 'Mug', 'Cap', 'Tote'];

async function expectTiles(page: Page, shown: string[]) {
  for (const name of NAMES) {
    if (shown.includes(name)) await expect(page.getByTestId(`product-tile-${name}`)).toBeVisible();
    else await expect(page.getByTestId(`product-tile-${name}`)).toHaveCount(0);
  }
}

async function pick(page: Page, group: string, term: string) {
  await page.getByTestId(`filter-chip-group-${group}`).click();
  await page.getByTestId(`filter-chip-group-${group}-${term}`).click();
}

for (const [width, height] of [[390, 844], [1280, 800]] as const) {
  test(`picks and clears term pills at ${width}x${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.goto('/pos/catalogue-terms');
    await expect(page.getByTestId('catalogue-terms-screen')).toBeVisible();
    await expectTiles(page, NAMES);

    await pick(page, 'brand', 'acme');
    await expect(page.getByTestId('filter-chip-group-brand')).toHaveText('Acme');
    await expectTiles(page, ['Shirt', 'Mug']);
    await pick(page, 'colour', 'blue');
    await expectTiles(page, ['Shirt']);
    if (width === 390) await page.screenshot({ path: testInfo.outputPath('catalogue-terms-390.png') });
    await page.getByTestId('filter-chip-group-colour-remove').click();
    await expectTiles(page, ['Shirt', 'Mug']);
    await page.getByTestId('filter-chip-group-brand-remove').click();
    await expectTiles(page, NAMES);
  });

  test(`searches a term pill's terms at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/pos/catalogue-terms');
    await expect(page.getByTestId('catalogue-terms-screen')).toBeVisible();

    await page.getByTestId('filter-chip-group-brand').click();
    await page.getByTestId('filter-chip-group-brand-search').fill('ze');
    await expect(page.getByTestId('filter-chip-group-brand-zest')).toBeVisible();
    await expect(page.getByTestId('filter-chip-group-brand-acme')).toHaveCount(0);
  });
}
