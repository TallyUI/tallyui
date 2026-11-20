// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createOrderBuilder } from '../order/order-builder';
import { roundMicrosToMinor } from '../tax/exact';
import { toOrderCreateEnvelope } from './command';
import { finalizeOrder } from './finalize';

const options = { capabilities: { orderCreate: 5 }, now: new Date('2026-11-20T10:00:00.000Z') };
const RATES = [
  { id: 12, code: 'FEE A', label: 'Fee test A', rate: '5.0000', priority: 1, compound: false, shipping: false },
  { id: 13, code: 'FEE B', label: 'Fee test B', rate: '5.0000', priority: 2, compound: false, shipping: false },
];

const order = (pricesIncludeTax: boolean, amountMinor: number, roundAtSubtotal?: boolean) => {
  const builder = createOrderBuilder({ currency: 'USD', taxContext: { pricesIncludeTax, getTaxRatePpm: () => 100000,
    ...(roundAtSubtotal !== undefined
      ? { rounding: { granularity: 'woocommerce' as const, roundAtSubtotal }, getTaxRates: () => RATES } : {}) } });
  builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 1999, currency: 'USD' } });
  builder.addFee({ name: 'Fee', amountMinor, taxClass: 'fee-rounding-test' });
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  const finalized = finalizeOrder(builder.getSnapshot(), options);
  return { fee: finalized.fees![0], sent: toOrderCreateEnvelope(finalized, 'till').payload.fees![0] };
};

describe('order.create fee taxMinor in WooCommerce mode (#1131)', () => {
  it('F1: exclusive, per-rate rounding sends 0.51 + 0.51 = 1.02, as proved on WC 11.1.1', () => {
    const { fee, sent } = order(false, 1010, false);
    expect(fee.taxLines.map((tax) => tax.taxMicros)).toStrictEqual(['50500000', '50500000']);
    expect(roundMicrosToMinor(BigInt(fee.taxMicros))).toBe(101);
    expect(sent.taxMinor).toBe(102);
  });

  it('F2: exclusive, round at subtotal sums unrounded rates, as read in WooCommerce code (not run on the store)', () => {
    expect(order(false, 1010, true).sent.taxMinor).toBe(101);
  });

  it('F3: a generic store sends the rounded summed micros', () => {
    const { fee, sent } = order(false, 1010);
    expect(sent.taxMinor).toBe(roundMicrosToMinor(BigInt(fee.taxMicros)));
  });

  it('F4: inclusive, per-rate ties round half down (not proved on the store)', () => {
    const { fee, sent } = order(true, 1111, false);
    expect(fee.taxLines.map((tax) => tax.taxMicros)).toStrictEqual(['50500000', '50500000']);
    expect(sent.taxMinor).toBe(100);
  });

  it("F5: a generic store's inclusive half-cent tie is rounded half away from zero", () => {
    const builder = createOrderBuilder({
      currency: 'USD',
      taxContext: { pricesIncludeTax: true, getTaxRatePpm: () => 200000 },
    });
    builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 1999, currency: 'USD' } });
    builder.addFee({ name: 'Fee', amountMinor: 9, taxClass: 'fee-rounding-test' });
    builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
    const finalized = finalizeOrder(builder.getSnapshot(), options);
    expect(finalized.fees![0].taxMicros).toBe('1500000');
    const { payload } = toOrderCreateEnvelope(finalized, 'till');
    expect(payload.fees![0].taxMinor).toBe(2);
  });
});
