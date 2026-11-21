// @vitest-environment node
import { expect, it } from 'vitest';
import { createOrderBuilder } from '../order/order-builder';
import { contentVersion, toOrderCreateEnvelope } from './command';
import { finalizeOrder } from './finalize';
import type { PosOrder } from './types';

// A leg's takenAt is the till's own record: order.create never sends it.
it('T9 sends the same order.create bytes and content version with or without a payment takenAt', () => {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 200000 } });
  builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 1000, currency: 'EUR' } });
  builder.addPayment({ method: 'external', methodId: 'card', amountMinor: 500, reference: 'ref-1', takenAt: '2026-11-21T10:15:00.000Z' });
  builder.addPayment({ method: 'cash', amountMinor: 700, tenderedMinor: 1000, changeMinor: 300, takenAt: '2026-11-21T10:16:00.000Z' });
  const finalized = finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 12 }, now: new Date('2026-11-21T10:17:00.000Z') });
  const taken: PosOrder = { ...finalized, payments: finalized.payments.map((payment, i) => ({ ...payment, takenAt: `2026-11-21T10:1${5 + i}:00.000Z` })) };
  const untaken: PosOrder = { ...finalized, payments: finalized.payments.map(({ takenAt: _takenAt, ...payment }) => payment) };
  expect(untaken.payments.every((payment) => !('takenAt' in payment))).toBe(true);
  expect(contentVersion(taken)).toBe(contentVersion(untaken));
  for (const options of [undefined, { maxVersion: 12 }, { maxVersion: 10 }, { maxVersion: 9 }]) {
    const sent = toOrderCreateEnvelope(taken, 'device-1', 1, options), plain = toOrderCreateEnvelope(untaken, 'device-1', 1, options);
    expect(sent).toStrictEqual(plain);
    expect(JSON.stringify(sent)).toBe(JSON.stringify(plain));
    expect(JSON.stringify(sent)).not.toContain('takenAt');
  }
});
