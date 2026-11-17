// ADR-090 ruling 38: the period report counts a reopened sale's till money only, as takings do (gate 11).
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { StoreOrder } from '@tallyui/core';
import { createOrderBuilder } from '../order/order-builder';
import { orderBuilderFromStoreOrder } from '../order/from-store-order';
import { finalizeOrder } from '../pos-order/finalize';
import type { PosOrder } from '../pos-order/types';
import { ensureRegister } from '../register/register-document';
import { closureSchema, registerSessionCreator } from '../register/schemas';
import { closeSession, openSession, writeClosure, type ClosureCollection, type RegisterSessionCollection } from '../register/session-store';
import { reportOrderFromPosOrder } from './adapters';
import { salesFigures } from './sales-figures';

const options = { currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } };
const capabilities = { orderCreate: 5 };
const line = (id: string, totalMinor: number) =>
  ({ id, productId: id, name: id, quantity: 1, subtotalMinor: totalMinor, totalMinor, subtotalTaxMinor: 0, taxMinor: 0 });

/** A store order of `lines`, paid `paidMinor` by a store cash leg, reopened, finalized with `tillCashMinor` more. */
function reopened(sessionId: string, lines: number[], paidMinor: number, tillCashMinor: number, drop = 0): PosOrder {
  const totalMinor = lines.reduce((sum, amount) => sum + amount, 0);
  const builder = orderBuilderFromStoreOrder({
    id: '41', reference: '41', clientOrderId: 'u-1', revision: `sha256:${'a'.repeat(64)}`, status: 'completed',
    placedAt: '2026-11-17T10:00:00.000Z', currency: 'EUR', pricesIncludeTax: false, customer: null,
    lines: lines.map((amount, i) => line(`l${i}`, amount)), fees: [], shipping: [], coupons: [], refunds: [],
    discountMinor: 0, discountTaxMinor: 0, taxLines: [], taxMinor: 0, totalMinor,
    payments: [{ id: 'p1', method: 'pos_cash', title: 'Cash', amountMinor: paidMinor }],
  } as StoreOrder, options);
  for (let i = 0; i < drop; i++) builder.removeItem(builder.getSnapshot().lineItems.at(-1)!.id);
  if (tillCashMinor) builder.addPayment({ method: 'cash', amountMinor: tillCashMinor });
  return { ...finalizeOrder(builder.getSnapshot(), { capabilities }), sessionId };
}

function tillSale(sessionId: string, cashMinor: number): PosOrder {
  const builder = createOrderBuilder(options);
  builder.addLine({ productId: 'coffee', name: 'Coffee', unitPrice: { amount: cashMinor, currency: 'EUR' } });
  builder.addPayment({ method: 'cash', amountMinor: cashMinor });
  return { ...finalizeOrder(builder.getSnapshot()), sessionId };
}

let db: RxDatabase<{ closures: ClosureCollection; register_sessions: RegisterSessionCollection }>;
beforeEach(async () => {
  db = await createRxDatabase({
    name: `reopened${Math.random().toString(36).slice(2)}`, storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false,
  });
  await db.addCollections({ closures: { schema: closureSchema }, register_sessions: registerSessionCreator() });
  await ensureRegister(db.register_sessions, 'web');
});
afterEach(async () => {
  await db.remove();
});

const figures = (orders: PosOrder[]) =>
  salesFigures({ orders: orders.map((order) => reportOrderFromPosOrder(order)), range: { from: '2000-01-01', to: '2100-01-01' }, timezone: 'UTC' }).payments;

it("report takenMinor equals the closure's takings for a session holding a reopened order", async () => {
  const session = await openSession(db.register_sessions, {
    registerId: 'register', expectedFloatMinor: 0, countedFloatMinor: 0, openedBy: '7', businessDay: { year: 2026, month: 11, day: 17 },
  });
  const orders = [tillSale(session.id, 1000), reopened(session.id, [1000], 500, 500)];
  expect(orders[1].payments.map((payment) => [payment.amountMinor, payment.storePaymentId])).toEqual([[500, 'p1'], [500, undefined]]);
  const closure = await writeClosure({
    closures: db.closures, register: db.register_sessions, storeKey: 'store', counted: 1000, otherTenders: {}, movements: [], orders,
    session: await closeSession(db.register_sessions, session.id, { counted: { cash: 1000 } }), softwareVersion: '1.0.0',
  });
  const payments = figures(orders);
  expect(payments.takenMinor).toBe(closure.period_sales_total_minor);
  expect(payments.takenMinor).toBe(1500);
  expect(payments.rows.map((row) => row.method)).toEqual(['cash']);
});

it('an overpaid reopened order adds nothing to takenMinor', () => {
  const order = reopened('s', [1000, 2200], 3200, 0, 1);
  expect(order).toMatchObject({ totalMinor: 1000, refundDueMinor: 2200 });
  expect(figures([order])).toEqual({ rows: [], takenMinor: 0 });
});

it("a till sale's report row is unchanged", () => {
  const order = tillSale('s', 1000);
  const row = reportOrderFromPosOrder(order);
  expect(row).not.toHaveProperty('paidEarlierMinor');
  expect(row.payments).toEqual(order.payments.map(({ method, amountMinor }) => ({ method, amountMinor })));
});
