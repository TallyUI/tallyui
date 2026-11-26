// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { createOrderBuilder } from '../order/order-builder';
import { orderDraftSchema, restoreOrderDraft } from '../order/order-drafts';
import type { Order } from '../order/types';
import { buildReceiptData } from '../receipt/build-receipt-data';
import { ensureRegister } from '../register/register-document';
import { closureSchema, registerSessionCreator } from '../register/schemas';
import { closeSession, openSession, writeClosure, type ClosureCollection, type RegisterSessionCollection } from '../register/session-store';
import type { TaxContext } from '../tax/types';
import { toOrderCreateEnvelope, toOrderUpdateEnvelope } from './command';
import { finalizeOrder, withSentForm } from './finalize';
import { reopenRefusedOrder } from './reopen';
import { posOrderCollection } from './schema';
import type { PosOrder } from './types';
import { uuidv7 } from './uuidv7';

let db: RxDatabase<{ register_sessions: RegisterSessionCollection; closures: ClosureCollection;
  pos_orders: RxCollection<PosOrder>; order_drafts: RxCollection }>;
beforeEach(async () => {
  db = await createRxDatabase({ name: `charge${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  await db.addCollections({ register_sessions: registerSessionCreator(), closures: { schema: closureSchema },
    pos_orders: posOrderCollection(), order_drafts: { schema: orderDraftSchema } });
});
afterEach(async () => { await db.remove(); });

const grouped = { granularity: 'per_rate_group_items', mode: 'half_up' } as const;
const perLine = { granularity: 'per_line_items', mode: 'half_up' } as const;
const context = (rounding?: TaxContext['rounding']): TaxContext => ({ pricesIncludeTax: false, rounding,
  getTaxRatePpm: (taxClass) => taxClass === 'reduced' ? 70000 : 190000 });
const quarter: TaxContext = { pricesIncludeTax: true, getTaxRatePpm: () => 250000 };
const inclusive = { amountMinor: 100, amountIncludesTax: true };
const exclusive = { amountMinor: 800, amountIncludesTax: false };
function sale(taxContext: TaxContext, field: 'fees' | 'shipping' = 'fees', item = 50, entry = inclusive) {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext });
  builder.addLine({ productId: 'p', name: 'Item', taxClass: 'reduced', unitPrice: { amount: item, currency: 'EUR' } });
  builder[field === 'fees' ? 'addFee' : 'addShipping']({ name: 'Charge', taxClass: 'standard', ...entry });
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  return builder.getSnapshot();
}
const finalize = (snapshot: Order, chargeTaxMode = false) => finalizeOrder(snapshot, { capabilities: { orderCreate: 5, chargeTaxMode } });
const payload = (order: PosOrder) => toOrderCreateEnvelope(order, 'till').payload;
function expectLegacyWire(order: PosOrder) {
  const legacy = structuredClone(order);
  for (const charge of [...(legacy.fees ?? []), ...(legacy.shipping ?? [])]) delete charge.entered;
  expect(JSON.stringify(payload(order))).toBe(JSON.stringify(payload(legacy)));
}
async function reopened(order: PosOrder, taxContext: TaxContext) {
  await db.pos_orders.insert({ ...order, syncStatus: 'rejected', error: { code: 'total_mismatch', message: 'Total mismatch' } });
  const draftId = await reopenRefusedOrder(order.id, { orders: db.pos_orders, drafts: db.order_drafts, sessions: db.register_sessions,
    taxContext, taxClassOf: () => 'reduced' });
  const draft = await db.order_drafts.findOne(draftId).exec();
  return restoreOrderDraft(JSON.parse(draft!.data), { currency: 'EUR', taxContext }).getSnapshot();
}
async function expectZ(order: PosOrder) {
  await ensureRegister(db.register_sessions, 'web');
  const session = await openSession(db.register_sessions, { registerId: 'register', expectedFloatMinor: 0, countedFloatMinor: 0,
    openedBy: '7', businessDay: { year: 2026, month: 9, day: 16 } });
  const counted = order.totalMinor;
  const closed = await closeSession(db.register_sessions, session.id, { counted: { cash: counted } });
  const closure = await writeClosure({ closures: db.closures, register: db.register_sessions, storeKey: 'store', session: closed,
    counted, otherTenders: {}, movements: [], orders: [{ ...order, sessionId: session.id }], softwareVersion: '1.0.0' });
  const rows = closure.breakdowns.tax_rates as Record<string, { rate_ppm: number; net_minor: number; tax_minor: number }>;
  expect(Object.values(rows).map((row) => [row.rate_ppm, row.net_minor, row.tax_minor])).toStrictEqual(
    order.taxByRate!.map((row) => [row.ratePpm, row.netMinor, row.amountMinor]));
}

it.each([['D1', grouped, 'fees'], ['D2', undefined, 'fees'], ['D3', grouped, 'shipping'], ['D4', perLine, 'fees']] as const)(
  '%s keeps the entry for the Z and reopen without changing the wire', async (_, rounding, field) => {
    const taxContext = context(rounding), order = finalize(sale(taxContext, field));
    expect(order[field]![0].entered).toStrictEqual(inclusive);
    expectLegacyWire(order);
    await expectZ(order);
    const draft = await reopened(order, taxContext);
    expect(draft.totalMinor).toBe(order.totalMinor);
    if (rounding !== perLine) {
      expect(draft).toMatchObject({ totalMinor: 154, taxMinor: 19 });
      expect(finalize(draft).totalMinor).toBe(154);
    }
    if (rounding === grouped) expect(order.taxByRate!.map((row) => [row.ratePpm, row.netMinor, row.amountMinor]))
      .toStrictEqual([[70000, 50, 3], [190000, 84, 16]]);
  });

it('D5 sends the marked entry to a capable store', () => {
  const order = finalize(sale(context(grouped)), true);
  expect(order.fees![0].entered).toStrictEqual({ ...inclusive, sent: true });
  expect(payload(order).fees![0]).toMatchObject(inclusive);
});

it('D6 keeps an exclusive entry at an inclusive store', async () => {
  const order = finalize(sale(quarter, 'fees', 1000, exclusive));
  expect(order.fees![0].entered).toStrictEqual(exclusive);
  expectLegacyWire(order);
  await expectZ(order);
  expect((await reopened(order, quarter)).totalMinor).toBe(order.totalMinor);
});

it('D7 sends the WooCommerce display row even with the capability', () => {
  const taxContext: TaxContext = { pricesIncludeTax: false, getTaxRatePpm: () => 100000,
    rounding: { granularity: 'woocommerce', roundAtSubtotal: false }, getTaxRates: () => [
      { id: 12, code: 'FEE A', label: 'Fee test A', rate: '5.0000', priority: 1, compound: false, shipping: false },
      { id: 13, code: 'FEE B', label: 'Fee test B', rate: '5.0000', priority: 2, compound: false, shipping: false },
    ] };
  const order = finalize(sale(taxContext, 'fees', 1999, { ...inclusive, amountMinor: 1010 }), true);
  expect(order.fees![0]).not.toHaveProperty('entered');
  expect(payload(order).fees![0].amountMinor).toBe(order.display!.fees![0].amountMinor);
  expect(payload(order).fees![0]).not.toHaveProperty('amountIncludesTax');
});

it('D8 stores no entry for a same-mode fee', () => {
  expect(finalize(sale(context(), 'fees', 50, exclusive)).fees![0]).not.toHaveProperty('entered');
});

it.each([perLine, grouped])('D9 taxes the first print as entered under $granularity', (rounding) => {
  const snapshot = sale({ ...quarter, pricesIncludeTax: false, rounding }, 'fees', 800, { ...inclusive, amountMinor: 1002 });
  for (const capable of [false, true]) {
    const order = finalize(snapshot, capable);
    const receipt = buildReceiptData(withSentForm(snapshot, order), { storeName: 'Store' });
    const amounts = receipt.totals.taxLines.map((row) => row.amountMinor);
    expect(amounts).toStrictEqual(order.taxByRate!.map((row) => row.amountMinor));
    expect(amounts.reduce((sum, amount) => sum + amount, 0)).toBe(400);
  }
});

it('D10 sends the refinalized fee without a mode on update', async () => {
  const taxContext = context(grouped), order = finalize(sale(taxContext));
  const draft = await reopened(order, taxContext);
  const again = finalize({ ...draft, storeOrder: { id: '4711', revision: 'r1' } });
  expect(toOrderUpdateEnvelope(again, 'till').payload.fees![0]).not.toHaveProperty('amountIncludesTax');
});

it.each([false, true])('D11 round-trips the stored entry with capability %s', async (capable) => {
  const order = finalize(sale(context(grouped)), capable);
  await db.pos_orders.insert(order);
  expect((await db.pos_orders.findOne(order.id).exec())!.toJSON()).toStrictEqual(order);
});

it.each([false, true])('D12 restores only the amount and mode with capability %s', async (capable) => {
  const taxContext = context(grouped), draft = await reopened(finalize(sale(taxContext), capable), taxContext);
  expect(draft.fees![0]).toMatchObject(inclusive);
  expect(draft.fees![0]).not.toHaveProperty('sent');
  expect(finalize(draft, !capable).fees![0].entered).toStrictEqual(capable ? inclusive : { ...inclusive, sent: true });
});
