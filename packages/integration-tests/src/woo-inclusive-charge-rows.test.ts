// @vitest-environment node
// #1341: on a Woo-rounded sale each charge's wire amountMinor is its display row (ADR-075/076), so the server's
// row = payload check passes; the stored charge and the WooCommerce body (priced from the stored charge) do not move.
import { describe, expect, it } from 'vitest';
import { precheckCommand } from '@tallyui/core/server';
import { toWooOrderPayload } from '@tallyui/connector-woocommerce';
import { createOrderBuilder, finalizeOrder, toOrderCreateEnvelope, toOrderUpdateEnvelope } from '@tallyui/pos';
import type { PosOrder } from '@tallyui/pos';

const vat = [{ id: 1, code: 'VAT', label: 'VAT', rate: '20.0000', priority: 1, compound: false, shipping: true }];
const supported = { orderCreate: Array.from({ length: 12 }, (_, i) => i + 1), register: [1], orderUpdate: [1], cashRounding: true };
const couponContext = { couponIds: new Map([['ten', '303']]), productCategories: new Map(), calcDiscountsSequentially: false,
  configs: new Map([['ten', { discount_type: 'percent' as const, amount: '10', limit_usage_to_x_items: null, product_ids: [],
    excluded_product_ids: [], product_categories: [], excluded_product_categories: [], exclude_sale_items: false }]]) };
type Charge = { kind: 'fee' | 'shipping'; amountMinor: number; taxStatus?: 'none'; amountIncludesTax?: boolean; percent?: number };
interface Sale { lines: [number, number][]; charges: Charge[]; coupon?: true; roundAtSubtotal?: boolean; inclusive?: boolean; woo?: boolean }

function sell({ lines, charges, coupon, roundAtSubtotal = false, inclusive = true, woo = true }: Sale) {
  const builder = createOrderBuilder({ currency: 'GBP', taxContext: { pricesIncludeTax: inclusive, getTaxRatePpm: () => 200000,
    ...(woo ? { rounding: { granularity: 'woocommerce' as const, roundAtSubtotal }, getTaxRates: () => vat } : {}) },
  ...(coupon ? { couponContext } : {}) });
  for (const [i, [price, quantity]] of lines.entries()) builder.addLine({ productId: `${i + 1}`, name: `Item ${i}`, quantity, unitPrice: { amount: price, currency: 'GBP' } });
  for (const [i, { kind, ...charge }] of charges.entries()) {
    if (kind === 'fee') builder.addFee({ id: `c${i}`, name: 'Fee', ...charge });
    else builder.addShipping({ id: `c${i}`, name: 'Post', methodId: 'flat_rate', ...charge });
  }
  if (coupon) builder.setCoupons(['ten']);
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  const order = finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 12 } });
  const envelope = toOrderCreateEnvelope(order, 'device-1341', 1, { maxVersion: 12 });
  // The wire as it was before #1341: every charge sent at its stored amount.
  const before = structuredClone(envelope);
  for (const fee of before.payload.fees ?? []) fee.amountMinor = order.fees!.find(({ id }) => id === fee.clientFeeId)!.amountMinor;
  for (const charge of before.payload.shipping ?? []) charge.amountMinor = order.shipping!.find(({ id }) => id === charge.clientShippingId)!.amountMinor;
  return { order, envelope, before };
}
const body = (envelope: ReturnType<typeof sell>['envelope'], order: PosOrder) => {
  const result = toWooOrderPayload(envelope, order);
  if ('error' in result) throw new Error(result.error.message);
  return JSON.stringify(result.payload);
};
/** [wire amountMinor, display row] per charge, matched by id. */
function pairs({ order, envelope }: ReturnType<typeof sell>) {
  return [...(envelope.payload.fees ?? []).map((fee) => [fee.amountMinor, order.display!.fees!.find(({ id }) => id === fee.clientFeeId)!.amountMinor]),
    ...(envelope.payload.shipping ?? []).map((charge) => [charge.amountMinor, order.display!.shipping!.find(({ id }) => id === charge.clientShippingId)!.amountMinor])];
}
const fee = (amountMinor: number, extra: Partial<Charge> = {}): Charge => ({ kind: 'fee', amountMinor, ...extra });
const ship = (amountMinor: number, extra: Partial<Charge> = {}): Charge => ({ kind: 'shipping', amountMinor, ...extra });

describe('#1341 Woo-rounded: a charge goes on the wire at its display row', () => {
  // 20% VAT, inclusive, Woo per-line rounding; an inclusive tax rounds half down. Each total is Woo's: the line net in
  // cents, fees at their raw 6-dp net, shipping net in cents, plus the rounded taxes; the last charge row takes the residue.
  it.each([
    // 3 × 16.91 = 50.73: tax 8.455 → 8.45, net 42.28. Fee 2.85: net 2.375, tax 0.475 → 0.47. Total 42.28 + 2.375 + 8.92
    // = 53.575 → 53.58. The line row is 5072, so the fee row is 5358 − 5072 = 286: residue +1.
    { name: 'fee only, residue +1', sale: { lines: [[1691, 3]], charges: [fee(285)] }, lineRows: [5072], rows: [[286, 286]], stored: [285], total: 5358 },
    // 10.00: tax 1.666667 → 1.67, net 8.33. Three fees of 0.01: net 0.008333 each, tax 0.001667 → 0.00 each. Total
    // 8.33 + 0.024999 + 1.67 = 10.024999 → 10.02. Rows 1000 + 1 + 1 leave 0 for the last fee: residue −1.
    { name: 'three 1p fees, residue −1', sale: { lines: [[1000, 1]], charges: [fee(1), fee(1), fee(1)] }, lineRows: [1000], rows: [[1, 1], [1, 1], [0, 0]], stored: [1, 1, 1], total: 1002 },
    // 10.00 as above; fee 1.00: net 0.833333, tax 0.166667 → 0.17. Total 8.33 + 0.833333 + 1.84 = 11.003333 → 11.00
    // = 1000 + 100: residue 0.
    { name: 'fee only, residue 0', sale: { lines: [[1000, 1]], charges: [fee(100)] }, lineRows: [1000], rows: [[100, 100]], stored: [100], total: 1100 },
    // 3 × 26.99 = 80.97: tax 13.495 → 13.49, net 67.48. Fee 4.39: net 3.658333, tax 0.731667 → 0.73. Shipping 12.36: net
    // 10.30, tax 2.06. Total 67.48 + 3.658333 + 10.30 + 16.28 = 97.718333 → 97.72. Rows 8096 + 439 leave 1237: +1.
    { name: 'fee and shipping, residue +1 on shipping', sale: { lines: [[2699, 3]], charges: [fee(439), ship(1236)] }, lineRows: [8096], rows: [[439, 439], [1237, 1237]], stored: [439, 1236], total: 9772 },
    // 21.82: tax 3.636667 → 3.64, net 18.18; 23.43: tax 3.905 → 3.90, net 19.53. Shipping 3.31: net 2.758333 → 2.76, tax
    // 0.551667 → 0.55. Total 18.18 + 19.53 + 2.76 + 8.09 = 48.56. Rows 2182 + 2342 leave 4856 − 4524 = 332: +1.
    { name: 'shipping only, residue +1', sale: { lines: [[2182, 1], [2343, 1]], charges: [ship(331)] }, lineRows: [2182, 2342], rows: [[332, 332]], stored: [331], total: 4856 },
  ] as { name: string; sale: Sale; lineRows: number[]; rows: number[][]; stored: number[]; total: number }[])('$name', ({ sale, lineRows, rows, stored, total }) => {
    const sold = sell(sale);
    expect(sold.order.display!.lines.map(({ amountMinor }) => amountMinor)).toEqual(lineRows);
    expect(pairs(sold)).toEqual(rows);
    expect([...sold.order.fees ?? [], ...sold.order.shipping ?? []].map(({ amountMinor }) => amountMinor)).toEqual(stored);
    expect(sold.order.totalMinor).toBe(total);
    expect(precheckCommand(sold.envelope, supported)).toBeUndefined();
    expect(body(sold.envelope, sold.order)).toBe(body(sold.before, sold.order));
  });

  // Exclusive store, each charge entered tax-inclusive (stored at its net, ADR-075); found by a seeded search. Where the
  // moved charge's stored amount is its whole-cent net, a wire row one off it would switch the body to the 6-dp net.
  const incl = { amountIncludesTax: true };
  it.each([
    { name: 'tax-none fee takes +1, stored = net', sale: { lines: [[2021, 3]], charges: [fee(136, incl), fee(4, incl), fee(1195, { ...incl, taxStatus: 'none' })] },
      rows: [[113, 113], [3, 3], [1196, 1196]], stored: [113, 3, 1195], nets: ['113333300', '3333300', '1195000000'], total: 8612 },
    { name: '0 shipping takes +1, stored = net', sale: { lines: [[543, 2], [207, 2]], charges: [ship(0), fee(1006, incl), fee(1007, incl)] },
      rows: [[838, 838], [839, 839], [1, 1]], stored: [838, 839, 0], nets: ['838333300', '839166700', '0'], total: 3814 },
    { name: 'last fee takes −1, stored ≠ net', sale: { lines: [[1144, 3], [2053, 1]], charges: [fee(2, incl), fee(177, incl)] },
      rows: [[2, 2], [147, 147]], stored: [2, 148], nets: ['1666700', '147500000'], total: 6761 },
  ] as { name: string; sale: Sale; rows: number[][]; stored: number[]; nets: string[]; total: number }[])(
    'Woo exclusive, a charge entered tax-inclusive: the wire is the row, the body does not move ($name)', ({ sale, rows, stored, nets, total }) => {
      const sold = sell({ ...sale, inclusive: false });
      const charges = [...sold.order.fees ?? [], ...sold.order.shipping ?? []];
      expect(pairs(sold)).toEqual(rows);
      expect([charges.map(({ amountMinor }) => amountMinor), charges.map(({ netMicros }) => netMicros)]).toEqual([stored, nets]);
      expect(sold.order.totalMinor).toBe(total);
      expect(precheckCommand(sold.envelope, supported)).toBeUndefined();
      expect(body(sold.envelope, sold.order)).toBe(body(sold.before, sold.order));
    });

  const shapes: [string, Charge[]][] = [['fee', [fee(285)]], ['shipping', [ship(331)]], ['fee + shipping', [fee(439), ship(1236)]],
    ['two shipping', [ship(155), ship(397)]], ['none fee beside a taxed one', [fee(120, { taxStatus: 'none' }), fee(285)]],
    ['a 0 charge', [fee(0), ship(331)]], ['an exclusive-entered charge', [fee(285, { amountIncludesTax: false }), ship(331)]],
    ['a percent fee', [fee(0, { percent: 7 }), ship(97)]], ['three 1p fees', [fee(1), fee(1), fee(1)]]];
  // Entered tax-inclusive: on an exclusive store a row can move off the stored net (the search cases above).
  const inclusiveEntered: [string, Charge[]][] = [['inclusive-entered fees, a tax-none last', [fee(136, incl), fee(4, incl), fee(1195, { ...incl, taxStatus: 'none' })]],
    ['inclusive-entered fees, a 0 shipping', [ship(0), fee(1006, incl), fee(1007, incl)]]];
  const lineSets: [number, number][][] = [[[1691, 3]], [[2182, 1], [2343, 1]], [[1000, 1]], [[2699, 3], [893, 1]]];
  it.each([...shapes, ...inclusiveEntered])('matrix: %s × inclusive × coupon × roundAtSubtotal × lines, create and update', (_name, charges) => {
    for (const lines of lineSets) for (const coupon of [undefined, true] as const) for (const roundAtSubtotal of [false, true]) for (const inclusive of [true, false]) {
      const sold = sell({ lines, charges, coupon, roundAtSubtotal, inclusive });
      const label = JSON.stringify({ lines, coupon, roundAtSubtotal, inclusive });
      for (const [wire, row] of pairs(sold)) expect(wire, label).toBe(row);
      expect(precheckCommand(sold.envelope, supported), label).toBeUndefined();
      expect(body(sold.envelope, sold.order), label).toBe(body(sold.before, sold.order));
      const update = toOrderUpdateEnvelope({ ...sold.order, storeOrderId: '901', baseRevision: 'r1' }, 'device-1341', 1, { maxVersion: 12 });
      expect([update.payload.fees, update.payload.shipping].flat().map((charge) => charge?.amountMinor), label)
        .toEqual([sold.envelope.payload.fees, sold.envelope.payload.shipping].flat().map((charge) => charge?.amountMinor));
      expect(precheckCommand(update, supported), label).toBeUndefined();
    }
  });

  it.each([[true, false, ''], [false, true, ', no charge entered in the other mode'], [false, false, '']])('inclusive %s, woo %s: wire bytes as before #1341%s', (inclusive, woo) => {
    for (const [, charges] of shapes) for (const lines of lineSets) for (const coupon of woo ? [undefined, true] as const : [undefined]) {
      const sold = sell({ lines, charges, inclusive, woo, coupon });
      expect(JSON.stringify(sold.envelope), JSON.stringify({ charges, lines, coupon })).toBe(JSON.stringify(sold.before));
    }
  });

  it('generic rounding sends the stored charge, not its display row', () => {
    const { order } = sell({ lines: [[1000, 1]], charges: [fee(285), ship(331)], woo: false });
    // An altered stored order, as no builder makes one; only the gate decides.
    const clone = structuredClone(order);
    clone.display!.fees![0].amountMinor = 286;
    clone.display!.shipping![0].amountMinor = 330;
    const { payload } = toOrderCreateEnvelope(clone, 'device-1341', 1, { maxVersion: 12 });
    expect([payload.fees![0].amountMinor, payload.shipping![0].amountMinor]).toEqual([285, 331]);
  });

  it('reopening the stored charge (as reopen.ts re-adds it, at its stored amount) gives the original totals', () => {
    const { order } = sell({ lines: [[1691, 3]], charges: [fee(285)] });
    const again = sell({ lines: [[1691, 3]], charges: [fee(order.fees![0].amountMinor)] }).order;
    expect([again.totalMinor, again.taxMinor, again.display!.fees![0].amountMinor]).toEqual([order.totalMinor, order.taxMinor, 286]);
  });

  it('known limit: nine 1p fees drive the last row to −1, and the server check still refuses the sale', () => {
    // 8.33 + 9 × 0.008333 + tax 1.67 (each fee's 0.001667 → 0.00) = 10.074997 → 10.07: rows 1000 + 8 × 1 leave 1007 − 1008 = −1.
    const sold = sell({ lines: [[1000, 1]], charges: Array.from({ length: 9 }, () => fee(1)) });
    expect(sold.order.display!.fees!.at(-1)!.amountMinor).toBe(-1);
    // Known limit (ADR-075/076): the row, and so the wire amount, is below 0 and the shape check refuses it.
    expect(precheckCommand(sold.envelope, supported)).toEqual({ id: sold.envelope.id, status: 'rejected',
      error: { code: 'invalid_payload', message: 'fees[8].amountMinor: expected a safe integer >= 0' } });
  });
});
