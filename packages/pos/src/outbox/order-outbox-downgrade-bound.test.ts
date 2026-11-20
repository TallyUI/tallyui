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

describe('order outbox downgrade from order.create 11 (ADR-086 d2, amended 2026-11-19)', () => {
  it("O1 resends a sale lifted to 11 at today's version for a store capped at 10, without the addresses, and nothing throws", async () => {
    pick.above = 0;
    const db = await createRxDatabase({ name: `downgradebound${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }) });
    try {
      const { pos_orders: collection } = await db.addCollections({ pos_orders: posOrderCollection() });
      // The same sale, its customer's billing kept but not taxed on it: 11 with the address, 9 (its coupon lines) below.
      const { taxAddress: _taxAddress, ...order } = sale();
      expect(order.customer?.billing).toBeDefined();
      await collection.insert(order);
      const send = vi.fn<CommandTransport<OrderCreateEnvelope>['send']>(async (batch) => ({ kind: 'results',
        results: batch.map((command): CommandResult => command.version > 10
          ? { id: command.id, status: 'rejected', error: { code: 'unsupported_version', message: 'Maximum 10', data: { orderCreate: 10 } } }
          : { id: command.id, status: 'applied', serverRefs: { orderId: 'server-1', totalMinor: command.payload.totalMinor } }) }));
      const outbox = createOrderOutbox({ collection, transport: { send }, deviceId: 'device', random: () => 0.5,
        getMaxOrderCreateVersion: () => 11 });
      try { await outbox.flush(); } finally { outbox.stop(); }
      const sent = send.mock.calls.map(([batch]) => batch[0]);
      expect(sent.map((command) => command.version)).toEqual([11, 9]);
      expect(sent[0].payload.customer).toHaveProperty('billing.city', 'Albany');
      expect(sent[1].payload.customer).toStrictEqual({ email: 'ann@example.com', customerId: '42' });
      expect(sent[1].payload).not.toHaveProperty('taxAddress');
      expect((await collection.findOne(order.id).exec())!.toJSON())
        .toMatchObject({ syncStatus: 'applied', sentVersion: 9, downgradedFrom: 11 });
    } finally { await db.remove(); }
  }, 10_000);
});

describe('order outbox downgrade from order.create 12 (ADR-092)', () => {
  it("M4 resends a sale lifted to 12 at 11 for a store capped at 11, without tax ids or meta, and nothing throws", async () => {
    pick.above = 0;
    const db = await createRxDatabase({ name: `downgradebound${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }) });
    try {
      const { pos_orders: collection } = await db.addCollections({ pos_orders: posOrderCollection() });
      // The same sale, not taxed on its billing, with tax ids and meta: 12 with them, 11 (its addresses) below.
      const { taxAddress: _taxAddress, ...untaxed } = sale();
      const order = { ...untaxed, customer: { ...untaxed.customer!, taxIds: [{ type: 'eu_vat', value: 'DE123456789', label: 'VAT' }] },
        meta: [{ key: 'po_number', value: 'PO-1' }] };
      await collection.insert(order);
      const send = vi.fn<CommandTransport<OrderCreateEnvelope>['send']>(async (batch) => ({ kind: 'results',
        results: batch.map((command): CommandResult => command.version > 11
          ? { id: command.id, status: 'rejected', error: { code: 'unsupported_version', message: 'Maximum 11', data: { orderCreate: 11 } } }
          : { id: command.id, status: 'applied', serverRefs: { orderId: 'server-1', totalMinor: command.payload.totalMinor } }) }));
      const outbox = createOrderOutbox({ collection, transport: { send }, deviceId: 'device', random: () => 0.5,
        getMaxOrderCreateVersion: () => 12 });
      try { await outbox.flush(); } finally { outbox.stop(); }
      const sent = send.mock.calls.map(([batch]) => batch[0]);
      expect(sent.map((command) => command.version)).toEqual([12, 11]);
      expect(sent[0].payload.customer?.taxIds).toStrictEqual([{ type: 'eu_vat', value: 'DE123456789' }]);
      expect(sent[0].payload.meta).toStrictEqual([{ key: 'po_number', value: 'PO-1' }]);
      expect(sent[1].payload.customer).toStrictEqual({ email: 'ann@example.com', customerId: '42',
        billing: { city: 'Albany', state: 'NY', postcode: '12207', country: 'US' } });
      expect(sent[1].payload).not.toHaveProperty('meta');
      expect((await collection.findOne(order.id).exec())!.toJSON())
        .toMatchObject({ syncStatus: 'applied', sentVersion: 11, downgradedFrom: 12 });
    } finally { await db.remove(); }
  }, 10_000);
});
