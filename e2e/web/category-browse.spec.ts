import { test, expect, type Page } from '@playwright/test';

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

// v2's slot 0 (browse/term-grid.tsx:271-272, term-tile.tsx:181-209): in a level the first tile is the level itself,
// with the back badge top-right, ahead of the products; tapping it goes back to the tiles.
for (const [width, height] of [[390, 844], [1280, 800]] as const) {
  test(`category level back poster at ${width}x${height}`, async ({ page }) => {
    // Layout at rest: the deal (category-deal.tsx) is checked by E1–E3.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height });
    await page.goto('/pos/category-browse');
    await page.getByTestId('category-tile-pcat_ceramics').click();

    const parent = page.getByTestId('category-level-parent');
    await expect(parent).toBeVisible();
    const parentBox = (await parent.boundingBox())!;
    const badgeBox = (await page.getByTestId('category-level-parent-back').boundingBox())!;
    expect(badgeBox.x, 'the badge is inside the poster').toBeGreaterThanOrEqual(parentBox.x);
    expect(badgeBox.y).toBeGreaterThanOrEqual(parentBox.y);
    expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(parentBox.x + parentBox.width + 0.5);
    expect(badgeBox.y + badgeBox.height).toBeLessThanOrEqual(parentBox.y + parentBox.height + 0.5);

    const productBox = (await page.getByTestId(/^product-tile-/).first().boundingBox())!;
    expect(parentBox.y + parentBox.height <= productBox.y + 0.5 || parentBox.x + parentBox.width <= productBox.x + 0.5,
      'the poster comes before the first product').toBe(true);
    await page.screenshot({ path: test.info().outputPath(`category-level-parent-${width}.png`) });

    await parent.click();
    await expect(page.getByTestId('category-browse')).toBeVisible();
  });
}

// The category deal (v2 deal-stack.tsx): the level's parent walks from the tapped tile to slot 0, and going back
// walks it home. The page runs on Playwright's clock, paused and stepped one 16 ms frame at a time, so the film is
// the same at any real frame rate. A requestAnimationFrame loop presses `press` on its first frame, then records
// each frame's box and opacity of `id`, and whether the root grid is back.
type Box = { x: number; y: number; width: number; height: number; opacity: number; t: number; root: boolean };
const film = async (page: Page, id: string, press: string, ms = 700) => {
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const filming = page.evaluate(([target, button, span]) => new Promise<Box[]>((done) => {
    const frames: Box[] = [];
    const start = performance.now();
    const step = () => {
      const el = document.querySelector(`[data-testid="${target}"]`);
      const root = !!document.querySelector('[data-testid="category-browse"]');
      if (el) {
        const { x, y, width, height } = el.getBoundingClientRect();
        // The cell's own opacity is on the DealCell (or root box) around the tile.
        const opacity = Number(getComputedStyle(el.parentElement!).opacity) * Number(getComputedStyle(el).opacity);
        frames.push({ x, y, width, height, opacity, t: Math.round(performance.now() - start), root });
      } else frames.push({ x: NaN, y: NaN, width: 0, height: 0, opacity: 0, t: Math.round(performance.now() - start), root });
      if (performance.now() - start < span) requestAnimationFrame(step); else done(frames);
    };
    requestAnimationFrame(() => { (document.querySelector(`[data-testid="${button}"]`) as HTMLElement).click(); step(); });
  }), [id, press, ms] as const);
  for (let at = 0; at <= ms + 32; at += 16) await page.clock.runFor(16);
  const frames = await filming;
  await page.clock.resume();
  return frames;
};
const near = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) <= 2 && Math.abs(a.y - b.y) <= 2;
const distinct = (frames: Box[]) => new Set(frames.map((f) => `${Math.round(f.x)},${Math.round(f.y)}`)).size;
const shown = (frames: Box[]) => frames.filter((f) => f.opacity > 0);
// The root grid lays out its columns after its first paint; a box is read once it holds still.
const settled = async (page: Page, id: string) => {
  let box = await page.getByTestId(id).boundingBox();
  for (let i = 0; i < 20; i += 1) {
    await page.waitForTimeout(100);
    const next = await page.getByTestId(id).boundingBox();
    if (box && next && near(box, next) && Math.abs(box.width - next.width) < 1) return next;
    box = next;
  }
  throw new Error(`${id} never held still`);
};
const trace = (frames: Box[]) => frames.map((f) => `${f.t}:${Math.round(f.x)},${Math.round(f.y)}@${f.opacity.toFixed(2)}`).join(' ');

test.describe('category deal at 1280x800', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/pos/category-browse');
  });

  test('E1: the parent walks from the tapped tile to slot 0', async ({ page }) => {
    const from = await settled(page, 'category-tile-pcat_ceramics');
    const frames = shown(await film(page, 'category-level-parent', 'category-tile-pcat_ceramics'));
    const rest = await settled(page, 'category-level-parent');
    console.log(`E1 from ${JSON.stringify(from)} rest ${JSON.stringify(rest)} visible ${frames.length} `
      + `distinct ${distinct(frames)} frames ${trace(frames)}`);
    expect(near(frames[0], from), 'the first visible frame is on the tapped tile').toBe(true);
    expect(near(frames.at(-1)!, rest), 'it ends on slot 0').toBe(true);
    expect(distinct(frames), 'it moves through the frames between').toBeGreaterThanOrEqual(7);
  });

  test('E2: back gathers the parent home and the root returns', async ({ page }) => {
    const home = await settled(page, 'category-tile-pcat_ceramics');
    const rest = shown(await film(page, 'category-level-parent', 'category-tile-pcat_ceramics', 600)).at(-1)!;
    const frames = await film(page, 'category-level-parent', 'category-crumb-root', 800);
    const walk = shown(frames);
    const back = frames.find((f) => f.root)?.t ?? Infinity;
    const gap = (f: { x: number; y: number }) => Math.hypot(f.x - home.x, f.y - home.y);
    console.log(`E2 rest ${JSON.stringify(rest)} home ${JSON.stringify(home)} root at ${back}ms `
      + `gaps ${walk.map((f) => `${f.t}:${Math.round(gap(f))}`).join(' ')}`);
    expect(walk.length, 'the parent is filmed on its way home').toBeGreaterThanOrEqual(5);
    for (let i = 1; i < walk.length; i += 1) expect(gap(walk[i]), 'every frame is as near home as the last').toBeLessThanOrEqual(gap(walk[i - 1]) + 0.5);
    expect(gap(walk.at(-1)!), 'it moves toward the tapped tile').toBeLessThan(gap(rest) / 2);
    expect(back, 'the root grid is back by 800ms').toBeLessThan(800);
    // The root lays its columns out again after it mounts, so its tile is read until it comes to rest.
    await expect.poll(async () => near((await page.getByTestId('category-tile-pcat_ceramics').boundingBox())!, home),
      { message: 'the tile ends on its own box' }).toBe(true);
  });

  test('E3: with reduced motion the parent is on slot 0 from its first frame', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await settled(page, 'category-tile-pcat_ceramics');
    const frames = shown(await film(page, 'category-level-parent', 'category-tile-pcat_ceramics', 500));
    const rest = await settled(page, 'category-level-parent');
    console.log(`E3 rest ${JSON.stringify(rest)} visible ${frames.length} distinct ${distinct(frames)} first ${trace(frames.slice(0, 1))}`);
    expect(near(frames[0], rest), 'the first visible frame is already on slot 0').toBe(true);
    expect(distinct(frames)).toBe(1);
  });
});
