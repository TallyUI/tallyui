// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { couponPricingBasis, createOrderBuilder, type OrderBuilder } from '../order/order-builder';
import type { Order } from '../order/types';
import { finalizeOrder } from '../pos-order/finalize';
import { receiptTemplateData } from '../receipt-template/template-data';
import type { TaxContext } from '../tax/types';
import { buildReceiptData } from './build-receipt-data';
import { carriedCouponLabel, isCarriedCouponLabel } from './carried-rows';
import { buildReceiptDataFromPosOrder } from './reprint';
import type { ReceiptData } from './types';

const taxContext = (pricesIncludeTax: boolean): TaxContext =>
  ({ getTaxRatePpm: () => 200000, pricesIncludeTax, rounding: { granularity: 'per_order', mode: 'half_away_from_zero' } });
const label = (code: string) => `coupon ${code} not accepted at send`;
const config = { storeName: 'Shop' };

/** Two lines, one in each tax mode, a line discount on the first, and store-priced coupons: code to [lineIndex, amount][]. */
function sale(pricesIncludeTax: boolean, coupons: Record<string, Array<[number, number]>>, carried?: true) {
  const builder: OrderBuilder = createOrderBuilder({ currency: 'GBP', taxContext: taxContext(pricesIncludeTax) });
  const ids = [
    builder.addLine({ productId: 'p1', name: 'Inclusive', unitPrice: { amount: 1199, currency: 'GBP', taxInclusive: true } }),
    builder.addLine({ productId: 'p2', name: 'Exclusive', unitPrice: { amount: 733, currency: 'GBP', taxInclusive: false } }),
  ];
  builder.applyLineDiscount(ids[0], { type: 'percentage', value: 10 });
  builder.setCoupons(Object.keys(coupons), { kind: 'store-priced', ...(carried ? { carried } : {}), basis: couponPricingBasis(builder.getSnapshot()),
    priced: new Map(Object.entries(coupons).map(([code, lines], k) => [code, { couponId: `c${k}`,
      lines: lines.map(([index, amountMinor]) => ({ lineId: ids[index], amountMinor })) }])) });
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  const snapshot: Order = builder.getSnapshot();
  let nextId = 0;
  const stored = finalizeOrder(snapshot, { capabilities: { orderCreate: 12 }, now: new Date('2026-11-21T10:00:00.000Z'),
    newId: () => `019f6d2e-7800-7000-8000-${String(++nextId).padStart(12, '0')}` });
  return { snapshot, stored };
}

const rowsOf = (receipt: ReceiptData) => receipt.lineItems.flatMap((line) => line.displayDiscounts);
function expectCarried(receipt: ReceiptData, coupons: ReadonlyArray<{ code: string; amountMinor: number }>) {
  for (const coupon of coupons) {
    const rows = rowsOf(receipt).filter((row) => row.label === label(coupon.code));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(coupon.amountMinor);
  }
  expect(receipt.orderDiscountMinor + rowsOf(receipt).reduce((sum, row) => sum + row.amountMinor, 0)).toBe(receipt.totals.discountMinor);
}

describe.each([true, false])('carried coupon receipt rows (pricesIncludeTax: %s)', (pricesIncludeTax) => {
  const one = { save: [[0, 120], [1, 70]] as Array<[number, number]> };

  it('R1 the fresh receipt ends each line with the carried row, and the rows add up', () => {
    const { snapshot } = sale(pricesIncludeTax, one, true);
    const receipt = buildReceiptData(snapshot, config);
    for (const line of receipt.lineItems) expect(line.displayDiscounts.at(-1)).toEqual({ label: label('save'), amountMinor: expect.any(Number) });
    expect(receipt.lineItems[0].displayDiscounts).toHaveLength(2);
    expectCarried(receipt, snapshot.display.coupons!);
  });

  it('R2 the reprint shows the same rows, and the total equals the non-carried sale', () => {
    const { stored } = sale(pricesIncludeTax, one, true), plain = sale(pricesIncludeTax, one).stored;
    const receipt = buildReceiptDataFromPosOrder(stored, config);
    for (const line of receipt.lineItems) expect(line.displayDiscounts.at(-1)).toEqual({ label: label('save'), amountMinor: expect.any(Number) });
    expectCarried(receipt, stored.display!.coupons!);
    expect(receipt.totals.totalMinor).toBe(buildReceiptDataFromPosOrder(plain, config).totals.totalMinor);
  });

  it('R3 a non-carried coupon adds no row', () => {
    const { snapshot, stored } = sale(pricesIncludeTax, one);
    for (const receipt of [buildReceiptData(snapshot, config), buildReceiptDataFromPosOrder(stored, config)]) {
      expect(rowsOf(receipt).some((row) => row.label.startsWith('coupon '))).toBe(false);
    }
  });

  it('R4 two carried coupons on overlapping lines give two rows per shared line, in coupon order', () => {
    const { snapshot, stored } = sale(pricesIncludeTax, { first: [[0, 100], [1, 50]], second: [[1, 40]] }, true);
    for (const [receipt, coupons] of [[buildReceiptData(snapshot, config), snapshot.display.coupons!],
      [buildReceiptDataFromPosOrder(stored, config), stored.display!.coupons!]] as const) {
      expect(receipt.lineItems[0].displayDiscounts.map((row) => row.label).filter((text) => text.startsWith('coupon '))).toEqual([label('first')]);
      expect(receipt.lineItems[1].displayDiscounts.map((row) => row.label)).toEqual([label('first'), label('second')]);
      expectCarried(receipt, coupons);
    }
  });

  it('R5 the WCPOS template lists the carried row among the line discounts', () => {
    const { stored } = sale(pricesIncludeTax, one, true);
    const data = receiptTemplateData(buildReceiptDataFromPosOrder(stored, config));
    for (const line of data.lines) expect(line.discounts.map((row) => row.label)).toContain(label('save'));
  });
});

describe('isCarriedCouponLabel', () => {
  it('is true for a carried coupon label and false for every other row', () => {
    expect(isCarriedCouponLabel(carriedCouponLabel('save'))).toBe(true);
    for (const text of ['Discount', '10%', 'coupon save']) expect(isCarriedCouponLabel(text)).toBe(false);
  });
});
