// @vitest-environment node
import { expect, it } from 'vitest';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { createOrderBuilder } from '../order/order-builder';
import type { Order } from '../order/types';
import { roundedTaxByRate, taxLinesByRate } from '../tax/exact';
import { storedCharges, taxedLinesFor } from '../tax/taxed-lines';
import { toOrderCreateEnvelope } from './command';
import { finalizeOrder, withSentForm } from './finalize';
import { posOrderCollection } from './schema';
import type { PosOrder } from './types';
import { uuidv7 } from './uuidv7';

const entered = { amountMinor: 1002, amountIncludesTax: true };
const inclusive = { name: 'Charge', taxClass: 'standard', ...entered };
const rounding = { granularity: 'per_rate_group_items', mode: 'half_up' } as const;
const on = { orderCreate: 5, chargeTaxMode: true }, off = { orderCreate: 5 };
function sale(add: (builder: ReturnType<typeof createOrderBuilder>) => void = (builder) => builder.addFee(inclusive),
  pricesIncludeTax = false, grouped = false) {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax, getTaxRatePpm: () => 250000,
    ...(grouped ? { rounding } : {}) } });
  builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: pricesIncludeTax ? 1000 : 800, currency: 'EUR' } });
  add(builder);
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  return builder.getSnapshot();
}
function finalize(snapshot: Order, capabilities: { orderCreate: number; chargeTaxMode?: boolean } = on) {
  let nextId = 0;
  return finalizeOrder(snapshot, { capabilities, now: new Date('2026-11-26T10:00:00Z'),
    newId: () => `019f8f66-7800-7000-8000-${String(++nextId).padStart(12, '0')}` });
}
const payload = (order: PosOrder) => toOrderCreateEnvelope(order, 'till').payload;
function expectInclusive(order: PosOrder, field: 'fees' | 'shipping') {
  const stored = order[field]![0], wire = payload(order);
  expect(stored.entered).toStrictEqual({ ...entered, sent: true });
  expect(stored.amountMinor).toBe(802);
  expect(stored).not.toHaveProperty('amountIncludesTax');
  expect(wire[field]![0]).toMatchObject({ ...entered, taxMinor: 200, [field === 'fees' ? 'clientFeeId' : 'clientShippingId']: stored.id });
  expect(wire.display![field]![0].amountMinor).toBe(802);
}

it.each(['fees', 'shipping'] as const)('T1/T3 sends inclusive %s as entered but keeps the order-mode amount', (field) => {
  const order = finalize(sale((builder) => field === 'fees' ? builder.addFee(inclusive) : builder.addShipping(inclusive)));
  expectInclusive(order, field);
  expect(payload(order).totalMinor).toBe(2002);
});

it('T2 sends the converted fee, byte-identically for an absent or false capability', () => {
  const snapshot = sale(), order = finalize(snapshot, off), disabled = finalize(snapshot, { ...off, chargeTaxMode: false });
  expect(order.fees![0].entered).toStrictEqual(entered);
  expect(payload(order).fees![0]).not.toHaveProperty('amountIncludesTax');
  expect(payload(order).fees![0].amountMinor).toBe(802);
  expect(JSON.stringify(order)).toBe(JSON.stringify(disabled));
  expect(JSON.stringify(payload(order))).toBe(JSON.stringify(payload(disabled)));
});

it('T4 opts in the inclusive fee, not the shipping beside it', () => {
  const order = finalize(sale((builder) => {
    builder.addFee(inclusive);
    builder.addShipping({ name: 'Shipping', amountMinor: 500 });
  }));
  expectInclusive(order, 'fees');
  expect(order.shipping![0]).not.toHaveProperty('entered');
  expect(order.shipping![0]).not.toHaveProperty('amountIncludesTax');
  expect(payload(order).shipping![0]).not.toHaveProperty('amountIncludesTax');
  expect(payload(order).shipping![0].amountMinor).toBe(500);
});

it('T5 sends the net fee at an inclusive store', () => {
  const net = { amountMinor: 800, amountIncludesTax: false };
  const snapshot = sale((builder) => builder.addFee({ name: 'Fee', ...net }), true), order = finalize(snapshot);
  expect(order.fees![0].entered).toStrictEqual({ ...net, sent: true });
  expect(order.fees![0].amountMinor).toBe(1000);
  expect(order.fees![0].amountMinor).toBe(finalize(snapshot, off).fees![0].amountMinor);
  expect(payload(order).fees![0]).toMatchObject(net);
  expect(payload(order).totalMinor).toBe(2000);
});

it('T6 sends a same-mode fee exactly like a fee with no mode', () => {
  const fee = { name: 'Fee', amountMinor: 500 };
  const order = finalize(sale((builder) => builder.addFee({ ...fee, amountIncludesTax: false })));
  expect(order.fees![0]).not.toHaveProperty('entered');
  expect(payload(order).fees![0]).toStrictEqual(payload(finalize(sale((builder) => builder.addFee(fee)), off)).fees![0]);
});

it('T7 retains the entry even when the fee is untaxed', () => {
  const order = finalize(sale((builder) => builder.addFee({ ...inclusive, taxStatus: 'none' })));
  expect(order.fees![0].entered).toStrictEqual({ ...entered, sent: true });
  expect(payload(order).fees![0]).toMatchObject({ ...entered, taxMinor: 0 });
});

it('T8 resends the same payload', () => {
  const order = finalize(sale());
  expect(toOrderCreateEnvelope(order, 'till', 1).payload).toStrictEqual(toOrderCreateEnvelope(order, 'till', 2).payload);
});

it('T9 leaves the receipt unchanged', () => {
  const snapshot = sale();
  expect(withSentForm(snapshot, finalize(snapshot))).toStrictEqual(withSentForm(snapshot, finalize(snapshot, off)));
});

it('T10 stores the cashier entry in schema 25', async () => {
  const order = finalize(sale());
  const db = await createRxDatabase({ name: `charge${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  try {
    const { pos_orders } = await db.addCollections({ pos_orders: posOrderCollection() });
    expect(pos_orders.schema.version).toBe(25);
    expect((await pos_orders.insert(order)).toJSON()).toStrictEqual(order);
  } finally { await db.remove(); }
});

it.each(['fees', 'shipping', 'line'] as const)('T14/T15/T16 keeps default totals and tax rows for inclusive %s', (field) => {
  const add = (builder: ReturnType<typeof createOrderBuilder>) => {
    if (field === 'fees') builder.addFee(inclusive);
    else if (field === 'shipping') builder.addShipping(inclusive);
    else builder.addLine({ productId: 'a', name: 'Inclusive', unitPrice: { amount: 1002, currency: 'EUR', taxInclusive: true } });
  };
  const snapshot = sale(add, false, true), standard = sale(add), order = finalize(snapshot);
  const totals = ({ subtotalMinor, taxMinor, totalMinor }: Order) => ({ subtotalMinor, taxMinor, totalMinor });
  expect(totals(snapshot)).toStrictEqual(totals(standard));
  expect(order.taxByRate).toStrictEqual(finalize(standard).taxByRate);
  if (field !== 'line') {
    expect(snapshot).toMatchObject({ totalMinor: 2002, taxMinor: 400 });
    expect(order.taxByRate!.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(400);
    expect(payload(order)[field]![0]).toMatchObject(entered);
  }
});

it('T17 only falls back from per-rate-group rounding for inclusive items', () => {
  const snapshot = sale((builder) => builder.addFee({ name: 'Fee', amountMinor: 500 }), false, true);
  const rounded = (order: Order) => roundedTaxByRate(taxedLinesFor(order.lineItems, order.fees!, false, rounding), rounding);
  const result = rounded(snapshot);
  expect(result).toBeDefined();
  expect(snapshot.taxMinor).toBe(result!.taxMinor);
  expect(snapshot.totalMinor).toBe(1300 + result!.taxMinor);
  expect(rounded(sale(undefined, false, true))).toBeUndefined();
});

it('T18 restores the entered mode and generic charge net without changing stored amounts', () => {
  const charges = [{ amountMinor: 500 }, { amountMinor: 802, netMinor: 802, entered }, { amountMinor: 802, netMinor: 750, totalMinor: 1002, entered }];
  const result = storedCharges(charges);
  expect(result[0]).toBe(charges[0]);
  expect(result).toStrictEqual([{ amountMinor: 500 }, { amountMinor: 802, netMinor: 1002, entered, amountIncludesTax: true },
    { amountMinor: 802, netMinor: 750, totalMinor: 1002, entered, amountIncludesTax: true }]);
});

it.each([['T19', 'addFee'], ['T20', 'addShipping']] as const)('%s recomputes the stored tax by rate for %s', (_, add) => {
  const order = finalize(sale((builder) => builder[add](inclusive), false, true));
  const charges = [...(order.fees ?? []), ...(order.shipping ?? [])];
  const split = (rows: typeof charges) => taxLinesByRate(taxedLinesFor(order.lines, rows, order.pricesIncludeTax, order.taxRounding),
    order.taxMinor, undefined, order.taxRounding);
  const corrected = split(storedCharges(charges));
  const amounts = ({ ratePpm, code, netMinor, amountMinor }: { ratePpm: number; code?: string; netMinor: number; amountMinor: number }) =>
    ({ ratePpm, code, netMinor, amountMinor });
  expect(corrected.map(amounts)).toStrictEqual(order.taxByRate!.map(amounts));
  expect(corrected.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(400);
  expect(corrected.reduce((sum, row) => sum + row.netMinor, 0)).toBe(1602);
  expect(split(charges).reduce((sum, row) => sum + row.amountMinor, 0)).not.toBe(400);
});
