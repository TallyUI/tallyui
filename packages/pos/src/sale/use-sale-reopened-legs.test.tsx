import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { createOrderBuilder, orderDraftSchema, writeOrderDraft, type Order } from '../order';
import { couponPricingBasis } from '../order/order-builder';
import { posOrderCollection, type PosOrder } from '../pos-order';
import { finalizeOrder } from '../pos-order/finalize';
import { ReopenRefusedOrderError, reopenRefusedOrder } from '../pos-order/reopen';
import { uuidv7 } from '../pos-order/uuidv7';
import { registerSessionCreator } from '../register/schemas';
import type { RegisterSessionCollection } from '../register/session-store';
import { createTaxContext, TaxProvider } from '../tax';
import { useSale } from './use-sale';

// A reopened refused sale keeps the legs its refused order already took when the cashier tenders the rest.
const currency = 'GBP', capabilities = { orderCreate: 12 };
const taxProps = { pricesIncludeTax: false, ratesPpm: { default: 200000 } };
const taxContext = createTaxContext(taxProps);
let db: RxDatabase<{ pos_orders: RxCollection<PosOrder>; order_drafts: RxCollection; register_sessions: RegisterSessionCollection }>;

beforeEach(async () => {
  db = await createRxDatabase({ name: `reopenedlegs${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  await db.addCollections({ pos_orders: posOrderCollection(), order_drafts: { schema: orderDraftSchema },
    register_sessions: registerSessionCreator() });
});
afterEach(async () => { cleanup(); await db.remove(); });

/** reopen-carry's E7 shape (twoLines, exclusive): a store-priced coupon, paid in full by `split` captured legs. */
async function refused(split: 'cash' | 'cash+external' = 'cash'): Promise<PosOrder> {
  const builder = createOrderBuilder({ currency, taxContext });
  builder.addLine({ productId: 'p1', name: 'Shirt', unitPrice: { amount: 1000, currency }, quantity: 2 });
  const second = builder.addLine({ productId: 'p2', name: 'Cap', unitPrice: { amount: 500, currency } });
  builder.applyLineDiscount(second, { type: 'fixed', value: 40, label: 'Staff' });
  builder.applyOrderDiscount({ type: 'fixed', value: 150 });
  const ids = builder.getSnapshot().lineItems.map((line) => line.id);
  builder.setCoupons(['save'], { kind: 'store-priced', basis: couponPricingBasis(builder.getSnapshot()),
    priced: new Map([['save', { couponId: 'c1', lines: [{ lineId: ids[0], amountMinor: 120 }, { lineId: ids[1], amountMinor: 30 }] }]]) });
  const total = builder.getSnapshot().totalMinor;
  if (split === 'cash') builder.addPayment({ method: 'cash', amountMinor: total });
  else {
    builder.addPayment({ method: 'cash', amountMinor: 1000 });
    builder.addPayment({ method: 'external', amountMinor: total - 1000, reference: 'Card' });
  }
  const order: PosOrder = { ...finalizeOrder(builder.getSnapshot(), { capabilities, now: new Date('2026-11-21T10:00:00.000Z') }),
    syncStatus: 'rejected', error: { code: 'coupon_invalid', message: 'x' } };
  await db.pos_orders.insert(order);
  return order;
}
const deps = (caps = capabilities) => ({ orders: db.pos_orders, drafts: db.order_drafts, sessions: db.register_sessions,
  taxContext, now: () => new Date('2026-11-21T12:00:00.000Z'), capabilities: caps });
const paid = (order: { payments: Array<{ amountMinor: number }> }) => order.payments.reduce((sum, p) => sum + p.amountMinor, 0);
async function draftOf(id: string): Promise<Order> {
  return JSON.parse((await db.order_drafts.findOne(id).exec())!.data);
}

/** The amount the inexact refusal previews (as reopen-carry's G5), then the explicit drop: the reopened draft. */
async function reopenWithoutCoupons(order: PosOrder) {
  const error = await reopenRefusedOrder(order.id, deps({ orderCreate: 3 })).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ReopenRefusedOrderError);
  expect(error).toMatchObject({ reason: 'coupon_carry_inexact' });
  const { toCollectMinor } = error as ReopenRefusedOrderError;
  expect(toCollectMinor).toBeGreaterThan(0);
  const saved = await draftOf(await reopenRefusedOrder(order.id, deps(), { withoutCoupons: true }));
  expect(saved.coupons).toBeUndefined();
  return { saved, toCollectMinor: toCollectMinor! };
}

async function resume(id: string) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <TaxProvider {...taxProps}>{children}</TaxProvider>;
  }
  const hook = renderHook(() => useSale({ currency }, { registerId: 'register-1', cashierRef: 'cashier@store.test',
    capabilities, drafts: db.order_drafts }), { wrapper: Wrapper });
  await act(async () => { expect(await hook.result.current.resume(id)).toBeNull(); });
  return hook;
}

describe('useSale reopened legs', () => {
  it('H1 in-session withoutCoupons, cash: the copied leg stays and the balance due is the amount the refusal previewed', async () => {
    const order = await refused();
    const { saved, toCollectMinor } = await reopenWithoutCoupons(order);
    expect(saved.totalMinor - paid(saved)).toBe(toCollectMinor);
    const { result } = await resume(saved.id);
    expect(result.current.order.totalMinor).toBe(saved.totalMinor);
    await act(async () => { await result.current.startTender('cash'); });
    expect(result.current.error).toBeNull();
    expect(result.current.stage).toEqual({ kind: 'tender', method: 'cash' });
    expect(result.current.order.payments.map(({ id, method, amountMinor }) => ({ id, method, amountMinor })))
      .toEqual([{ id: saved.payments[0].id, method: 'cash', amountMinor: order.payments[0].amountMinor }]);
    expect(result.current.order.balanceDueMinor).toBe(toCollectMinor);
    expect(result.current.order.balanceDueMinor).toBe(result.current.order.totalMinor - order.payments[0].amountMinor);
  });

  it('H2 in-session withoutCoupons, external: the proposed external amount is the total less the copied legs', async () => {
    const order = await refused();
    const { saved, toCollectMinor } = await reopenWithoutCoupons(order);
    const { result } = await resume(saved.id);
    await act(async () => { await result.current.startTender('external'); });
    expect(result.current.error).toBeNull();
    const payments = result.current.order.payments;
    expect(payments).toHaveLength(2);
    expect(payments[0]).toMatchObject({ id: saved.payments[0].id, method: 'cash', amountMinor: order.payments[0].amountMinor, reopened: true });
    expect(payments[1]).toMatchObject({ method: 'external', amountMinor: toCollectMinor });
    expect(payments[1].amountMinor).toBe(saved.totalMinor - paid(saved));
    expect(payments[1].amountMinor).not.toBe(saved.totalMinor);
    expect(result.current.order.balanceDueMinor).toBe(0);
  });

  it('H3 park and resume: the copied leg is still held', async () => {
    const order = await refused();
    const { saved, toCollectMinor } = await reopenWithoutCoupons(order);
    const { result } = await resume(saved.id);
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    const parked = await draftOf(saved.id);
    expect(parked.payments.map((p) => p.reopened)).toEqual([true]);
    await act(async () => { expect(await result.current.resume(saved.id)).toBeNull(); });
    expect(result.current.order.payments.map((p) => p.reopened)).toEqual([true]);
    await act(async () => { await result.current.startTender('cash'); });
    expect(result.current.error).toBeNull();
    expect(result.current.order.payments.map(({ id, amountMinor }) => ({ id, amountMinor })))
      .toEqual([{ id: saved.payments[0].id, amountMinor: order.payments[0].amountMinor }]);
    expect(result.current.order.balanceDueMinor).toBe(toCollectMinor);
  });

  it('H4 a 4.0.0 draft, whose leg has no reopened flag, still holds its leg on resume (F3)', async () => {
    const order = await refused();
    const { saved } = await reopenWithoutCoupons(order);
    const old: Order = { ...saved, payments: saved.payments.map(({ reopened: _reopened, ...payment }) => payment) };
    expect(old.payments[0]).not.toHaveProperty('reopened');
    await writeOrderDraft(db.order_drafts, old);
    expect((await draftOf(saved.id)).payments[0]).not.toHaveProperty('reopened');
    const { result } = await resume(saved.id);
    expect(result.current.order.payments).toHaveLength(1);
    await act(async () => { await result.current.startTender('cash'); });
    expect(result.current.error).toBeNull();
    expect(result.current.order.payments).toHaveLength(1);
    expect(result.current.order.payments[0]).toMatchObject({ id: old.payments[0].id, amountMinor: old.payments[0].amountMinor });
    expect(result.current.order.payments[0]).not.toHaveProperty('reopened');
    expect(result.current.order.balanceDueMinor).toBe(result.current.order.totalMinor - old.payments[0].amountMinor);
  });

  it('H5 split legs: the cash and the external leg both survive the tender, and the balance due is the total less both', async () => {
    const order = await refused('cash+external');
    expect(order.payments.map((p) => p.method)).toEqual(['cash', 'external']);
    const { saved, toCollectMinor } = await reopenWithoutCoupons(order);
    const { result } = await resume(saved.id);
    await act(async () => { await result.current.startTender('cash'); });
    expect(result.current.error).toBeNull();
    expect(result.current.order.payments.map(({ id, method, amountMinor, reopened }) => ({ id, method, amountMinor, reopened })))
      .toEqual(saved.payments.map(({ id }, i) => ({ id, method: order.payments[i].method, amountMinor: order.payments[i].amountMinor, reopened: true })));
    expect(result.current.order.balanceDueMinor).toBe(result.current.order.totalMinor - paid(order));
    expect(result.current.order.balanceDueMinor).toBe(toCollectMinor);
  });
});
