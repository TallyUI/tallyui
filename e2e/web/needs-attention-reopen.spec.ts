import { test, expect } from '@playwright/test';

// Needs attention's Reopen (desk 2026-11-21) over the real reopenRefusedOrder, on the demo's seeded refused sales.
// The seed is use-sale-reopened-legs.test.tsx's refused(): GBP, prices exclude tax, 20% tax. Shirt £10.00 × 2 is 2000
// net; Cap £5.00 less its 40 Staff discount is 460; a fixed 150 order discount leaves 2310. The coupon takes 120 + 30 =
// 150 more, so the refused sale is 2160 net + 432 tax = 2592, paid in full in cash. Without the coupon it is 2310 net
// + 462 tax = 2772: the coupon's effect is 2772 − 2592 = 180, and with 2592 already taken in cash 180 is left to collect.
const PAID = 2592;
const EFFECT = 2772 - 2592;
const TO_COLLECT = PAID + EFFECT - PAID;
const gbp = (minor: number) => `£${(minor / 100).toFixed(2)}`;

test.describe('Needs attention Reopen at 1280x800', () => {
  test('reopens an inexact coupon sale without its coupon and a total mismatch directly; Resume holds the cash taken', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/pos/needs-attention');

    // N1: both refused rows are in Needs attention, and Row A offers Reopen.
    await expect(page.getByTestId('needs-attention-screen').getByRole('heading', { name: 'Needs attention' })).toBeVisible();
    await expect(page.getByTestId('order-row-demo-refused-coupon').first()).toBeVisible();
    await expect(page.getByTestId('order-row-demo-refused-total').first()).toBeVisible();
    await expect(page.getByTestId('order-demo-refused-coupon-reopen')).toHaveText('Reopen');

    // N2: order.create 3 cannot carry the coupon: the drop is offered at the amount still to collect.
    await page.getByTestId('order-demo-refused-coupon-reopen').click();
    await expect(page.getByTestId('order-demo-refused-coupon-reopen-without-coupon'))
      .toHaveText(`Reopen without the coupon: ${gbp(TO_COLLECT)} to collect`);
    await expect(page.getByTestId('parked-demo-refused-coupon')).toHaveCount(0);

    // N3: the drop parks the sale at the refused total plus the coupon's effect; the row reads Reopened, with Resume.
    await page.getByTestId('order-demo-refused-coupon-reopen-without-coupon').click();
    await expect(page.getByTestId('order-demo-refused-coupon-reopened')).toHaveText('Reopened as a parked sale.');
    await expect(page.getByTestId('order-demo-refused-coupon-resume')).toBeVisible();
    await expect(page.getByTestId('parked-demo-refused-coupon')).toContainText(gbp(PAID + EFFECT));

    // N4: a total mismatch has no coupon to carry: the first press reopens it.
    await page.getByTestId('order-demo-refused-total-reopen').click();
    await expect(page.getByTestId('order-demo-refused-total-reopened')).toHaveText('Reopened as a parked sale.');
    await expect(page.getByTestId('order-demo-refused-total-reopen-without-coupon')).toHaveCount(0);

    // N5 (#1169): the resumed sale holds the cash already taken, so only the difference is due.
    await page.getByTestId('order-demo-refused-coupon-resume').click();
    await expect(page.getByTestId('resumed-total')).toHaveText(gbp(PAID + EFFECT));
    await expect(page.getByTestId('resumed-due')).toHaveText(gbp(TO_COLLECT));
  });

  test('N6 a stale carried draft is discarded and reopened without its coupon', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/pos/needs-attention?carry=12');

    // On order.create 12 the carry is exact: the first press parks the sale with its coupon, at the refused total.
    await page.getByTestId('order-demo-refused-carried-reopen').click();
    await expect(page.getByTestId('order-demo-refused-carried-reopened')).toHaveText('Reopened as a parked sale.');
    await expect(page.getByTestId('order-demo-refused-carried-reopen-without-coupon')).toHaveCount(0);
    await expect(page.getByTestId('parked-demo-refused-carried')).toContainText(gbp(PAID));

    await page.getByTestId('parked-demo-refused-carried-discard-reopen').click();
    await expect(page.getByTestId('parked-demo-refused-carried')).toContainText(gbp(PAID + EFFECT));
  });
});
