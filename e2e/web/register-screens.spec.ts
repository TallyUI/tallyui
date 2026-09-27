import { test, expect, type Page } from '@playwright/test';

const sizes = [
  { width: 360, height: 640, label: '360x640' },
  { width: 1280, height: 800, label: '1280x800' },
];
const SHOT_DIR = '/Users/claude/.claude/jobs/2cb8f46e/tmp/register-screens-a';

async function shoot(page: Page, name: string, label: string) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}-${label}.png`, fullPage: true });
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
  });
}
