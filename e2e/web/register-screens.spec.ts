import { join } from 'node:path';
import { test, expect, type Page } from '@playwright/test';

const sizes = [
  { width: 360, height: 640, label: '360x640' },
  { width: 1280, height: 800, label: '1280x800' },
];
// A machine-local path doesn't belong in the repo, and CI has no such directory: screenshots are
// taken only when this names a folder to write them into (the Front desk review, 2026-09-28).
const SHOT_DIR = process.env.REGISTER_SCREENSHOT_DIR;

async function shoot(page: Page, name: string, label: string) {
  if (!SHOT_DIR) return;
  await page.screenshot({ path: join(SHOT_DIR, `${name}-${label}.png`), fullPage: true });
}

/**
 * Proves an element is not just intersecting the viewport (`toBeInViewport()`) but genuinely
 * uncovered: the real point at its centre resolves back to it (or a descendant), not to
 * whatever is painted on top (a header, an overlay). The Front desk review, 2026-09-28.
 */
async function expectUncovered(page: Page, testId: string) {
  const covered = await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el) return 'missing';
    const { left, top, width, height } = el.getBoundingClientRect();
    const hit = document.elementFromPoint(left + width / 2, top + height / 2);
    const ok = hit === el || (hit !== null && el.contains(hit));
    return ok ? null : (hit ? hit.outerHTML.slice(0, 200) : 'nothing (off-screen)');
  }, testId);
  expect(covered, `element at [data-testid="${testId}"]'s centre is covered by: ${covered}`).toBeNull();
}

/**
 * No two denomination tiles' boxes overlap, and each tile's own label sits inside its own box
 * (the Front desk fix round, 2026-09-28): a narrow viewport must not let a long note label spill
 * into the next tile.
 */
async function expectTilesDontOverlap(page: Page) {
  const tiles = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="den-tile-"]')).map((el) => {
      const box = el.getBoundingClientRect();
      const label = el.firstElementChild?.getBoundingClientRect();
      return {
        id: el.getAttribute('data-testid'),
        box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
        label: label && { left: label.left, top: label.top, right: label.right, bottom: label.bottom },
      };
    }),
  );
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      const a = tiles[i].box, b = tiles[j].box;
      const overlaps = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      expect(overlaps, `${tiles[i].id} overlaps ${tiles[j].id}`).toBe(false);
    }
    const { id, box, label } = tiles[i];
    if (label) {
      const inside = label.left >= box.left - 1 && label.right <= box.right + 1;
      expect(inside, `${id}'s label (${label.left}-${label.right}) overflows its tile (${box.left}-${box.right})`).toBe(true);
    }
  }
}

for (const size of sizes) {
  test.describe(`register screens at ${size.label}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(size);
    });

    test('RegisterPicker renders every register and picks on tap', async ({ page }) => {
      await page.goto('/pos/register/picker');
      await expect(page.getByTestId('register-picker')).toBeVisible();
      await expect(page.getByTestId('register-picker-row-front')).toBeVisible();
      await expect(page.getByTestId('register-picker-row-back')).toBeVisible();
      await page.getByTestId('register-picker-row-back').click();
      await expect(page.getByTestId('picked-register')).toHaveText('Picked: back');
      await shoot(page, 'picker', size.label);
    });

    test('OpenRegisterCard prefills the last count and opens', async ({ page }) => {
      await page.goto('/pos/register/open');
      await expect(page.getByTestId('open-register-card')).toBeVisible();
      await expect(page.getByTestId('open-register-chip-last')).toBeVisible();
      await expect(page.getByTestId('open-register-amount')).toHaveValue('200.00');
      await shoot(page, 'open', size.label);
      await page.getByTestId('open-register-chip-last').click();
      await expect(page.getByTestId('open-register-amount')).toHaveValue('570.10');
      await expect(page.getByTestId('opening-variance')).toBeVisible();
    });

    test('RegisterBar shows the register name', async ({ page }) => {
      await page.goto('/pos/register/bar');
      await expect(page.getByTestId('register-bar-name')).toHaveText('Front counter');
      await expect(page.getByTestId('register-bar-pill')).toHaveCount(0);
    });

    // Every pill describeRegisterBarPill can return (register-bar.helpers.ts), reviewed by the
    // Front desk from these screenshots. `approval` has no writer in TallyUI yet (a manager
    // approval flow is a later job); the demo page patches the field directly to render it.
    for (const [state, pill] of [
      ['choose', 'Choose a register'],
      ['offline', 'Offline'],
      ['approval', 'Approval needed'],
      ['counting', 'Counting'],
      ['overdue', 'Overdue'],
      ['closed', 'Register closed'],
      ['none', null],
    ] as const) {
      test(`RegisterBar pill for state=${state} reads ${pill ?? 'no pill'}`, async ({ page }) => {
        await page.goto(`/pos/register/bar?state=${state}`);
        await expect(page.getByTestId('register-bar-state')).toHaveText(`state=${state}`);
        if (pill) {
          await expect(page.getByTestId('register-bar-pill')).toHaveText(pill);
        } else {
          await expect(page.getByTestId('register-bar-pill')).toHaveCount(0);
        }
        await shoot(page, `bar-${state}`, size.label);
      });
    }

    test('MovementSheet records a paid out with a reason', async ({ page }) => {
      await page.goto('/pos/register/movement');
      await page.getByTestId('open-paid-out').click();
      await page.getByTestId('movement-amount').fill('20');
      await page.getByTestId('movement-reason').fill('Milk');
      await shoot(page, 'movement', size.label);
      await page.getByTestId('movement-confirm').click();
      await expect(page.getByTestId('last-recorded')).toContainText('paid_out 2000');
    });

    test('RegisterPanel shows a paid out with its reason, and Undo hides it', async ({ page }) => {
      await page.goto('/pos/register/panel');
      await expect(page.getByTestId('register-panel')).toBeVisible();
      await page.getByTestId('register-panel-paid-out').click();
      await page.getByTestId('movement-amount').fill('20');
      await page.getByTestId('movement-reason').fill('Stamps');
      await page.getByTestId('movement-confirm').click();
      await page.getByTestId('register-panel-movements').click();
      // The heading must be genuinely uncovered, not merely intersecting the viewport (the
      // Front desk review, 2026-09-28): toBeInViewport() alone missed it sitting under the
      // header once the taller, expanded movements list shrinks the centred dialog's own top.
      await expectUncovered(page, 'register-panel-amount');
      const row = page.locator('[data-testid^="movement-row-"]', { hasText: 'Stamps' });
      await expect(row).toBeVisible();
      await shoot(page, 'panel', size.label);
      const rowTestId = await row.getAttribute('data-testid');
      const movementId = rowTestId!.replace('movement-row-', '');
      await page.getByTestId(`movement-void-${movementId}`).click();
      await expect(row).toHaveCount(0);
    });

    test('RegisterColumn offers Close register when overdue with an empty cart', async ({ page }) => {
      await page.goto('/pos/register/column');
      await expect(page.getByTestId('register-column-overdue')).toBeVisible();
      await expect(page.getByTestId('cart-slot')).toBeVisible();
      await shoot(page, 'column', size.label);
      await page.getByTestId('toggle-cart-empty').click();
      await expect(page.getByTestId('register-column-overdue')).toHaveCount(0);
    });

    test('RegisterPanel in blind mode shows no amounts', async ({ page }) => {
      await page.goto('/pos/register/blind');
      await expect(page.getByTestId('register-panel')).toBeVisible();
      await expectUncovered(page, 'register-panel-amount');
      await page.getByTestId('register-panel-movements').click();
      await shoot(page, 'blind', size.label);
      const text = await page.getByTestId('register-panel').textContent();
      expect(text).not.toContain('€');
    });

    test('RegisterCount counts two notes, and the total updates', async ({ page }) => {
      await page.goto('/pos/register/count');
      await expect(page.getByTestId('register-count')).toBeVisible();
      await page.getByTestId('den-tile-5000').click();
      await page.getByTestId('den-tile-5000').click();
      await expect(page.getByTestId('den-count-5000')).toHaveText('2');
      await expect(page.getByTestId('count-amount')).toHaveValue('100.00');
      await expectTilesDontOverlap(page);
      await shoot(page, 'count', size.label);
    });

    test('RegisterCount labels whole notes without decimals', async ({ page }) => {
      await page.goto('/pos/register/count');
      await expect(page.getByTestId('den-tile-5000')).toHaveAttribute('aria-label', '€50');
      await expect(page.getByTestId('den-tile-1')).toHaveAttribute('aria-label', '€0.01');
    });

    test('RegisterCount keeps Close reachable and uncovered once scrolled into view', async ({ page }) => {
      await page.goto('/pos/register/count');
      await page.getByTestId('count-close').scrollIntoViewIfNeeded();
      await expectUncovered(page, 'count-close');
      await expectUncovered(page, 'count-back');
    });

    test('RegisterCount typing an amount clears the tiles', async ({ page }) => {
      await page.goto('/pos/register/count');
      await page.getByTestId('den-tile-5000').click();
      await expect(page.getByTestId('den-count-5000')).toHaveText('1');
      await page.getByTestId('count-amount').fill('123.45');
      await expect(page.getByTestId('den-count-5000')).toHaveText('0');
    });

    test('RegisterCount blind mode shows no variance', async ({ page }) => {
      await page.goto('/pos/register/count-blind');
      await expect(page.getByTestId('register-count')).toBeVisible();
      await page.getByTestId('count-amount').fill('50.00');
      await expect(page.getByTestId('count-variance')).toHaveCount(0);
      await shoot(page, 'count-blind', size.label);
    });

    test('RegisterCount refuses Close over the threshold without approve', async ({ page }) => {
      await page.goto('/pos/register/count');
      await page.getByTestId('count-amount').fill('1.00');
      await page.getByTestId('count-close').click();
      await expect(page.getByTestId('count-manager-line')).toHaveText(
        'Manager approval needed. Ask a manager to approve, or count again.',
      );
    });

    test('RegisterCount closes within threshold, and the closure sheet shows its number', async ({ page }) => {
      await page.goto('/pos/register/count');
      await page.getByTestId('count-amount').fill('200.00');
      await page.getByTestId('count-close').click();
      await expect(page.getByTestId('closure-sheet')).toBeVisible();
      await expect(page.getByTestId('closure-title')).toHaveText('Closure 1 written');
    });

    test('ClosureSheet shows the local closure number and figures per tender', async ({ page }) => {
      await page.goto('/pos/register/closure');
      await expect(page.getByTestId('closure-sheet')).toBeVisible();
      await expect(page.getByTestId('closure-title')).toHaveText('Closure 1 written');
      await expect(page.getByTestId('closure-counted-cash')).toBeVisible();
      await shoot(page, 'closure', size.label);
    });
  });
}
