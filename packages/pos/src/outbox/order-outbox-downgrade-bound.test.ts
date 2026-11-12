// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { CommandResult, OrderCreateEnvelope } from '@tallyui/core';
import { couponPricingBasis, createOrderBuilder } from '../order/order-builder';
import { finalizeOrder } from '../pos-order/finalize';
import { posOrderCollection } from '../pos-order/schema';
import { createOrderOutbox } from './order-outbox';
import type { CommandTransport } from './types';

// How many versions above the cap the mocked picker goes: a stand-in for a picking bug (0 is the real picker).
const pick = vi.hoisted(() => ({ above: 0 }));
vi.mock('../pos-order/command', async (importActual) => {
  const actual = await importActual<typeof import('../pos-order/command')>();
  const toOrderCreateEnvelope: typeof actual.toOrderCreateEnvelope = (order, deviceId, attempt, options) =>
    actual.toOrderCreateEnvelope(order, deviceId, attempt, options?.maxVersion === undefined ? options
      : { maxVersion: Math.min(actual.ORDER_CREATE_MAX_VERSION, options.maxVersion + pick.above) });
  return { ...actual, toOrderCreateEnvelope };
});

// A store-priced coupon sale taxed on the billing address: 9 with its coupon lines, 8 below, never lower.
function sale() {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: true, getTaxRatePpm: () => 190000,
    rounding: { granularity: 'per_order', mode: 'half_away_from_zero' } } });
  const lineId = builder.addLine({ productId: 'p', name: 'p', unitPrice: { amount: 1190, currency: 'EUR' } });
  const billing = { city: 'Albany', state: 'NY', postcode: '12207', country: 'US' };
  builder.setCustomer({ id: '42', name: 'Ann Lee', email: 'ann@example.com', billing });
  builder.setCoupons(['c'], { kind: 'store-priced', basis: couponPricingBasis(builder.getSnapshot()),
    priced: new Map([['c', { couponId: 'promo_1', lines: [{ lineId, amountMinor: 100 }] }]]) });
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  let nextId = 0;
  return finalizeOrder(builder.getSnapshot(), {
    now: new Date('2026-11-12T10:00:00.000Z'), newId: () => `019f6d2e-7800-7000-8000-${String(++nextId).padStart(12, '0')}`,
    capabilities: { orderCreate: 9 }, taxLocation: { taxBasedOn: 'billing', addressUsed: 'billing', location: billing },
  });
}

describe('order outbox downgrade bound (#790)', () => {
  it.each([
    ['ignores the cap', Infinity, 8, [9], { syncStatus: 'rejected', error: { code: 'unsupported_version',
      message: 'order.create 9 is the lowest this order can go; the store takes 8' } }],
    ['picks one above the cap', 1, 7, [9], { syncStatus: 'rejected', error: { code: 'unsupported_version',
      message: 'order.create 8 is the lowest this order can go; the store takes 7' } }],
    ['picks the real version', 0, 8, [9, 8], { syncStatus: 'applied', sentVersion: 8, downgradedFrom: 9 }],
  ])('stops resending when the picker %s', async (_label, above, serverMax, versions, outcome) => {
    pick.above = above;
    const db = await createRxDatabase({ name: `downgradebound${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }) });
    try {
      const { pos_orders: collection } = await db.addCollections({ pos_orders: posOrderCollection() });
      const order = sale();
      await collection.insert(order);
      // Refuses a fourth batch, so an unbounded loop fails the batch count instead of running out of memory.
      let batches = 0;
      const send = vi.fn<CommandTransport<OrderCreateEnvelope>['send']>(async (batch) => ++batches > 3
        ? { kind: 'refused', status: 400, reason: 'too many batches' }
        : { kind: 'results', results: batch.map((command): CommandResult => command.version > serverMax
          ? { id: command.id, status: 'rejected', error: { code: 'unsupported_version', message: `Maximum ${serverMax}`,
            data: { orderCreate: serverMax } } }
          : { id: command.id, status: 'applied', serverRefs: { orderId: 'server-1', totalMinor: command.payload.totalMinor } }) });
      const outbox = createOrderOutbox({ collection, transport: { send }, deviceId: 'device', random: () => 0.5,
        getMaxOrderCreateVersion: () => 9 });
      try { await outbox.flush(); } finally { outbox.stop(); }
      expect(send.mock.calls.map(([batch]) => batch[0].version)).toEqual(versions);
      expect((await collection.findOne(order.id).exec())!.toJSON()).toMatchObject(outcome);
    } finally { await db.remove(); }
  }, 10_000);
});
