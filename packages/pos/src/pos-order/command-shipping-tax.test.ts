// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createOrderBuilder } from '../order/order-builder';
import { woocommerceChargeTaxMinor } from '../order/woocommerce-tax';
import type { LineTaxLine } from '../order/types';
import { roundMicrosToMinor } from '../tax/exact';
import { toOrderCreateEnvelope } from './command';
import { finalizeOrder } from './finalize';

const options = { capabilities: { orderCreate: 5 }, now: new Date('2026-11-20T10:00:00.000Z') };
const RATES = [
  { id: 1, code: 'CA STATE', label: 'CA State', rate: '7.2500', priority: 1, compound: false, shipping: true },
  { id: 2, code: 'SF DISTRICT', label: 'SF District', rate: '1.3750', priority: 2, compound: false, shipping: true },
];

const order = (pricesIncludeTax: boolean, amountMinor: number, roundAtSubtotal?: boolean) => {
  const builder = createOrderBuilder({ currency: 'USD', taxContext: { pricesIncludeTax, getTaxRatePpm: () => 86250,
    ...(roundAtSubtotal !== undefined
      ? { rounding: { granularity: 'woocommerce' as const, roundAtSubtotal }, getTaxRates: () => RATES } : {}) } });
  builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 1999, currency: 'USD' } });
  builder.addShipping({ name: 'Shipping', amountMinor, methodId: 'flat_rate' });
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  const finalized = finalizeOrder(builder.getSnapshot(), options);
  return { charge: finalized.shipping![0], sent: toOrderCreateEnvelope(finalized, 'till').payload.shipping![0] };
};
const micros = (charge: { taxLines: readonly LineTaxLine[] }) => charge.taxLines.map((tax) => tax.taxMicros);
const line = (taxMicros: string): LineTaxLine => ({ code: 'x', rateId: 1, compound: false, ratePpm: 100000, taxMicros });

describe('order.create shipping taxMinor in WooCommerce mode (#1120)', () => {
  it('S1: inclusive, per-rate rounding: 0.333717 + 0.063291 sends 0.39, as stock WCPOS 2.0.4 case 4b', () => {
    const { charge, sent } = order(true, 500, false);
    expect(micros(charge)).toStrictEqual(['33371700', '6329100']);
    expect(sent.taxMinor).toBe(39);
  });

  it('S2: exclusive, per-rate rounding: 0.3335 + 0.06325 sends 33 + 6 = 39, not the rounded sum 40 (not proved on a store)', () => {
    const { charge, sent } = order(false, 460, false);
    expect(micros(charge)).toStrictEqual(['33350000', '6325000']);
    expect(roundMicrosToMinor(BigInt(charge.taxMicros))).toBe(40);
    expect(sent.taxMinor).toBe(39);
  });

  it('S3: inclusive, round at subtotal: the summed micros round once, unchanged at 0.40', () => {
    expect(order(true, 500, true).sent.taxMinor).toBe(40);
  });

  it('S4: a tie rounds half down when inclusive and half up when exclusive', () => {
    const charge = { taxLines: [line('12500000')], taxMicros: '12500000' };
    expect(woocommerceChargeTaxMinor(charge, false, true)).toBe(12);
    expect(woocommerceChargeTaxMinor(charge, false, false)).toBe(13);
  });

  it('S5: a generic store sends the rounded summed micros', () => {
    const { charge, sent } = order(false, 460);
    expect(sent.taxMinor).toBe(roundMicrosToMinor(BigInt(charge.taxMicros)));
  });
});
