import { test, expect, type Page } from '@playwright/test';

/** Walks up from the given testID to the nearest ancestor that actually scrolls. */
async function scrollRegionMetrics(page: Page, testId = 'cart-line-0') {
  return page.evaluate((id) => {
    let el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    while (el && !['auto', 'scroll'].includes(getComputedStyle(el).overflowY)) {
      el = el.parentElement;
    }
    return el ? { clientHeight: el.clientHeight, scrollHeight: el.scrollHeight } : null;
  }, testId);
}

const sizes = [
  { width: 360, height: 640 },
  { width: 1280, height: 800 },
];

test.describe('CartPanel pinned footer', () => {
  for (const size of sizes) {
    test(`footer stays pinned and the region scrolls at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/pos/cart-panel');

      const footer = page.getByTestId('cart-footer');
      const payButton = page.getByTestId('pay-button');
      await expect(footer).toBeVisible();
      await expect(payButton).toBeVisible();

      const footerBox = await footer.boundingBox();
      expect(footerBox).not.toBeNull();
      expect(footerBox!.y).toBeGreaterThanOrEqual(0);
      expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(size.height);

      // Visible and clickable without any scrolling (it's already fully in the viewport above).
      await payButton.click();

      const metrics = await scrollRegionMetrics(page);
      expect(metrics).not.toBeNull();
      expect(metrics!.clientHeight).toBeLessThan(metrics!.scrollHeight);

      // Scrolling the region to the end reveals afterItems, and the footer hasn't moved.
      await page.getByTestId('after-items').scrollIntoViewIfNeeded();
      await expect(page.getByTestId('after-items')).toBeVisible();
      const footerBoxAfterScroll = await footer.boundingBox();
      expect(footerBoxAfterScroll).toEqual(footerBox);
    });
  }

  test('with a single line, the footer still sits at the bottom of the panel', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/pos/cart-panel?lines=1');

    const panelBox = await page.getByTestId('cart-panel').boundingBox();
    const footerBox = await page.getByTestId('cart-footer').boundingBox();
    expect(panelBox).not.toBeNull();
    expect(footerBox).not.toBeNull();
    // Footer's bottom edge lands on the panel's bottom edge (within the
    // footer wrapper's own py-2 bottom padding), not just under the one line.
    expect(Math.abs(footerBox!.y + footerBox!.height - (panelBox!.y + panelBox!.height))).toBeLessThanOrEqual(10);
  });

  test('with no lines, a tall emptyState fills the scroll region and the footer stays at the bottom', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/pos/cart-panel?lines=0');

    const emptyState = page.getByTestId('empty-state');
    const footer = page.getByTestId('cart-footer');
    const panelBox = await page.getByTestId('cart-panel').boundingBox();
    const emptyBox = await emptyState.boundingBox();
    const afterItemsBox = await page.getByTestId('after-items').boundingBox();
    const footerBox = await footer.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(emptyBox).not.toBeNull();
    expect(afterItemsBox).not.toBeNull();
    expect(footerBox).not.toBeNull();

    // The content container's flex-grow lets the (flex-1) empty state fill
    // the scroll region, sharing it only with afterItems, which still
    // follows it -- instead of collapsing to its own text content and
    // leaving a dead gap between afterItems and the footer.
    const metrics = await scrollRegionMetrics(page, 'empty-state');
    expect(metrics).not.toBeNull();
    expect(Math.abs(emptyBox!.height + afterItemsBox!.height - metrics!.clientHeight)).toBeLessThanOrEqual(2);

    // The footer is still pinned at the bottom of the panel.
    expect(Math.abs(footerBox!.y + footerBox!.height - (panelBox!.y + panelBox!.height))).toBeLessThanOrEqual(10);
  });
});
