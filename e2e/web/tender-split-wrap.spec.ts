import { test, expect, type Page } from '@playwright/test';

// The even-split tiles (2 to 6 ways) wrap onto further rows on a narrow pane instead of scrolling sideways (#1478),
// as the pane's other tile groups do (tallyui-woocommerce #298).
const WAYS = [2, 3, 4, 5, 6];

/** Add a Shirt, check out, press Split; on a phone the cart is its own tab. */
async function openSplitWays(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/pos/split-sale');
  await page.getByTestId('product-tile-Shirt').click();
  if (width < 768) await page.getByText('Cart', { exact: true }).first().click();
  await page.getByTestId('cart-checkout').click();
  await page.getByTestId('tender-split-chip').click();
  const ways = page.getByTestId('tender-split-ways');
  await expect(ways).toBeVisible();
  return ways;
}

async function expectContained(page: Page, ways: ReturnType<Page['getByTestId']>) {
  const box = (await ways.boundingBox())!;
  for (const count of WAYS) {
    const tile = (await page.getByTestId(`tender-split-even-${count}`).boundingBox())!;
    expect(tile.x, `${count} ways left edge`).toBeGreaterThanOrEqual(box.x - 1);
    expect(tile.x + tile.width, `${count} ways right edge`).toBeLessThanOrEqual(box.x + box.width + 1);
  }
  const { scrollWidth, clientWidth } = await ways.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  expect(scrollWidth, 'tender-split-ways scrollWidth').toBeLessThanOrEqual(clientWidth + 1);
}

test.describe('Even-split tiles', () => {
  test('wrap onto more rows on a phone at 390x844', async ({ page }) => {
    const ways = await openSplitWays(page, 390, 844);
    await expectContained(page, ways);
    const two = (await page.getByTestId('tender-split-even-2').boundingBox())!;
    const six = (await page.getByTestId('tender-split-even-6').boundingBox())!;
    expect(six.y).toBeGreaterThan(two.y);
  });

  test('stay inside the pane at 1280x800', async ({ page }) => {
    const ways = await openSplitWays(page, 1280, 800);
    await expectContained(page, ways);
  });
});
