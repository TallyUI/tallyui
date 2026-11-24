// ADR-094: cash rounding is an order field. A cash leg that settles the sale at a rounded due records the
// signed difference in Order.cashRoundings, counted in totalMinor; a till rounds only against a store whose connector
// declares the cashRounding capability. The harness is tender-picks.test.tsx's, with the store's capabilities.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { formatMoney, paymentMethodOf, type PaymentMethodDescriptor, type PaymentRounding, type ServerCapabilities } from '@tallyui/core';
import {
  buildReceiptData, CASH_NOT_PAYABLE, CASH_PICK_LIMIT, CASH_SETTLE_LIMIT, CASH_WAITS_FOR_PAYMENT, countsTowardPaid, createOrderBuilder, displayCart, legStatus, NOTHING_TO_ROUND_AGAINST, VOID_LATER_CASH_FIRST, orderDraftSchema, posOrderCollection, reopenRefusedOrder,
  restoreOrderDraft, takingsByMethod, TaxProvider, taxProviderProps, toOrderCreateEnvelope, useSale, writeOrderDraft, type Order, type PosOrder,
} from '@tallyui/pos';
import { CustomerDisplayScreen } from '../sale/customer-display-screen';
import { cancelRefusedLeg } from '../sale/cancel-payment-view';
import { Tender } from '../sale/tender';
import { useTender } from '../sale/use-tender';
import { blue, pricing, SaleHarness, sale, traits } from './sale-harness';

let db: RxDatabase<{ pos_orders: RxCollection<PosOrder>; order_drafts: RxCollection; pos_drafts: RxCollection }> | undefined;
afterEach(async () => { cleanup(); await db?.remove(); db = undefined; });

const cash = paymentMethodOf('cash');
const card = paymentMethodOf('external');
const nearest: PaymentRounding = { incrementMinor: 10, mode: 'nearest' };
const down: PaymentRounding = { incrementMinor: 10, mode: 'down' };
const rounding = (rule: PaymentRounding): PaymentMethodDescriptor[] => [{ ...cash, defaults: { ...cash.defaults, rounding: rule } }, card];
const carries: ServerCapabilities = { orderCreate: 12, cashRounding: true };
/** R13: no flag; R13b: the flag false. Both are BASE byte for byte. */
const unflagged: [string, ServerCapabilities][] = [['R13', { orderCreate: 12 }], ['R13b', { orderCreate: 12, cashRounding: false }]];

let tender: ReturnType<typeof useTender>;
function SharedTender({ methods, beforeVoid }: { methods?: PaymentMethodDescriptor[]; beforeVoid?: Parameters<typeof Tender>[0]['beforeVoid'] }) {
  tender = useTender(sale, methods);
  return <Tender sale={sale} tender={tender} methods={methods} beforeVoid={beforeVoid} />;
}
const money = (amount: number) => formatMoney({ amount, currency: 'EUR' }) ?? '';
const text = (id: string) => screen.getByTestId(id).textContent;
const press = (id: string) => fireEvent.click(screen.getByTestId(id));
const enter = (minor: number) => act(() => tender.dispatch({ type: 'set-entry', minor }));
const disabled = (id: string) => screen.getByTestId(id).getAttribute('aria-disabled') === 'true';
/** tender-picks.test.tsx's start(), with the store's capabilities. */
function start(quantity = 2, methods?: PaymentMethodDescriptor[], capabilities?: ServerCapabilities) {
  render(<SaleHarness capabilities={capabilities}>{() => <SharedTender methods={methods} />}</SaleHarness>);
  act(() => sale.add(blue, traits));
  const id = sale.order.lineItems[0].id;
  act(() => sale.setQuantity(id, quantity));
  act(() => sale.startTender('cash'));
  return id;
}
/** R2's sale: one untaxed custom line of 3122 (order.create 5 or above, which every cap here gives). */
function startCustom(priceMinor: number, methods: PaymentMethodDescriptor[], capabilities: ServerCapabilities, beforeVoid?: Parameters<typeof Tender>[0]['beforeVoid']) {
  render(<SaleHarness capabilities={capabilities}>{() => <SharedTender methods={methods} beforeVoid={beforeVoid} />}</SaleHarness>);
  act(() => { expect(sale.addCustomLine({ name: 'Item', priceMinor, taxStatus: 'none' })).toMatchObject({ id: expect.any(String) }); });
  act(() => sale.startTender('cash'));
}
async function complete(): Promise<PosOrder> {
  await act(async () => { await sale.complete(); });
  expect(sale.stage.kind).toBe('receipt');
  if (sale.stage.kind !== 'receipt') throw new Error('no receipt');
  return sale.stage.posOrder;
}
/** R1: the 3125 sale taken in cash at the prefill, €31.30, with the flag. */
function roundUp() {
  start(2, rounding(nearest), carries);
  expect(text('tender-entry-amount')).toBe(money(3130));
  press('tender-take');
  return sale.order.payments[0];
}
async function database() {
  db = await createRxDatabase({ name: `cashround${Math.random().toString(36).slice(2)}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  await db.addCollections({ pos_orders: posOrderCollection(), order_drafts: { schema: orderDraftSchema }, pos_drafts: { schema: orderDraftSchema } });
  return db;
}
let till: ReturnType<typeof useSale>;
/** A till with drafts, for park/resume and a reopened draft. */
function Till({ drafts, methods }: { drafts: RxCollection; methods: PaymentMethodDescriptor[] }) {
  till = useSale(pricing, { registerId: 'register-1', cashierRef: 'cashier', capabilities: carries, drafts });
  tender = useTender(till, methods);
  return <Tender sale={till} tender={tender} methods={methods} />;
}
const renderTill = (drafts: RxCollection, methods: PaymentMethodDescriptor[]) =>
  render(<TaxProvider {...taxProviderProps(pricing)}><Till drafts={drafts} methods={methods} /></TaxProvider>);
const taxContext = { pricesIncludeTax: false, getTaxRatePpm: () => 250000 };
async function reopened(posOrder: PosOrder) {
  const { pos_orders, order_drafts } = await database();
  await pos_orders.insert({ ...posOrder, syncStatus: 'rejected', error: { code: 'coupon_invalid', message: 'The coupon is not valid' } });
  // posOrder has no sessionId, so reopen never reads the sessions.
  const id = await reopenRefusedOrder(posOrder.id, { orders: pos_orders, drafts: order_drafts, sessions: undefined as never, taxContext });
  return JSON.parse(String((await order_drafts.findOne(id).exec())!.data)) as Order;
}

it('R1: a cash leg that settles at the rounded-up due stores the due and records +5', async () => {
  const leg = roundUp();
  expect(sale.order.payments).toMatchObject([{ method: 'cash', amountMinor: 3130, tenderedMinor: 3130, changeMinor: 0 }]);
  expect(sale.order.cashRoundings).toEqual([{ paymentId: leg.id, minor: 5 }]);
  expect(sale.order).toMatchObject({ totalMinor: 3130, paidMinor: 3130, changeDueMinor: 0, balanceDueMinor: 0 });
  expect(screen.queryByTestId('tender-change')).toBeNull();
  expect(text(`tender-rounding-${leg.id}`)).toContain('Rounding');
  expect(text(`tender-rounding-${leg.id}`)).toContain(money(5));
  const posOrder = await complete();
  expect(posOrder.payments).toEqual([
    { id: expect.any(String), method: 'cash', amountMinor: 3130, takenAt: expect.any(String), tenderedMinor: 3130, changeMinor: 0 }]);
  expect(posOrder.cashRoundings).toEqual([{ paymentId: posOrder.payments[0].id, minor: 5 }]);
  expect(posOrder.totalMinor).toBe(3130);
});

it('R2: a cash leg that settles at the rounded-down due stores the due and records -2', async () => {
  startCustom(3122, rounding(nearest), carries);
  expect(text('tender-entry-amount')).toBe(money(3120));
  press('tender-take');
  const [leg] = sale.order.payments;
  expect(sale.order.payments).toMatchObject([{ method: 'cash', amountMinor: 3120, tenderedMinor: 3120, changeMinor: 0 }]);
  expect(sale.order.cashRoundings).toEqual([{ paymentId: leg.id, minor: -2 }]);
  expect(sale.order).toMatchObject({ totalMinor: 3120, balanceDueMinor: 0 });
  const posOrder = await complete();
  expect(posOrder).toMatchObject({ totalMinor: 3120, payments: [{ amountMinor: 3120 }], cashRoundings: [{ paymentId: posOrder.payments[0].id, minor: -2 }] });
});

it('R3: a remainder that rounds to zero closes the sale with an entry on the card leg and no new leg', async () => {
  start(2, rounding(down), carries);
  let cardId: string | null = null;
  act(() => { cardId = sale.addTender({ method: 'external', amountMinor: 3120 }); });
  expect(sale.order.balanceDueMinor).toBe(5);
  expect(text('tender-entry-amount')).toBe(money(0));
  expect(disabled('tender-take')).toBe(false);
  press('tender-take');
  expect(sale.order.payments).toHaveLength(1);
  expect(sale.order.cashRoundings).toEqual([{ paymentId: cardId, minor: -5 }]);
  expect(sale.order.balanceDueMinor).toBe(0);
  expect(disabled('tender-complete')).toBe(false);
  const posOrder = await complete();
  expect(posOrder.totalMinor).toBe(3120);
  expect(posOrder.cashRoundings).toEqual([{ paymentId: posOrder.payments[0].id, minor: -5 }]);
});

it('R3: at a zero due, a typed 10 shows no change and Take stays enabled', () => {
  start(2, rounding(down), carries);
  act(() => { sale.addTender({ method: 'external', amountMinor: 3120 }); });
  enter(10);
  expect(text('tender-entry-hint')).not.toContain('Change');
  expect(disabled('tender-take')).toBe(false);
});

it('R3b: a whole sale that rounds to nothing in cash refuses with NOTHING_TO_ROUND_AGAINST', () => {
  expect(NOTHING_TO_ROUND_AGAINST).toBe('This sale rounds to nothing in cash: take it by another method.');
  startCustom(4, rounding(nearest), carries);
  press('tender-take');
  expect(sale.error).toBe(NOTHING_TO_ROUND_AGAINST);
  expect(sale.order.payments).toEqual([]);
  expect(sale.order).not.toHaveProperty('cashRoundings');
});

it('R4: in a split, the cash last leg rounds the remainder only', () => {
  start(2, rounding(nearest), carries);
  act(() => { sale.addTender({ method: 'external', amountMinor: 1000 }); });
  expect(text('tender-entry-amount')).toBe(money(2130));
  press('tender-take');
  const [cardLeg, cashLeg] = sale.order.payments;
  expect(cardLeg).toMatchObject({ method: 'external', amountMinor: 1000 });
  expect(cashLeg).toMatchObject({ method: 'cash', amountMinor: 2130, tenderedMinor: 2130, changeMinor: 0 });
  expect(sale.order.cashRoundings).toEqual([{ paymentId: cashLeg.id, minor: 5 }]);
  expect(sale.order.totalMinor).toBe(3130);
});

it('R5: a cash part payment is never rounded', () => {
  start(2, rounding(nearest), carries);
  enter(1000);
  press('tender-take');
  expect(sale.order.payments).toMatchObject([{ method: 'cash', amountMinor: 1000, tenderedMinor: 1000, changeMinor: 0 }]);
  expect(sale.order).not.toHaveProperty('cashRoundings');
  expect(sale.order.totalMinor).toBe(3125);
});

it('R6: voiding the rounded cash leg clears its entry', () => {
  const leg = roundUp();
  expect(sale.order.cashRoundings).toEqual([{ paymentId: leg.id, minor: 5 }]);
  act(() => { expect(sale.voidTender(leg.id)).toBe(true); });
  expect(sale.order).not.toHaveProperty('cashRoundings');
  expect(sale.order).toMatchObject({ totalMinor: 3125, balanceDueMinor: 3125 });
});

it('R7: with a pending card leg the zero cash Take is BASE\'s no-op (no error); its failure leaves no entry', () => {
  start(2, rounding(down), carries);
  let cardId: string | null = null;
  act(() => { cardId = sale.addTender({ method: 'external', amountMinor: 3120, status: 'pending' }); });
  // A leg is in motion, so nothing rounds (Amendment 3): a zero cash amount is BASE's no-op, with no error.
  act(() => { expect(sale.addTender({ method: 'cash', amountMinor: 0, rounding: down })).toBeNull(); });
  expect(sale.error).toBeNull();
  act(() => { expect(sale.setTenderStatus(cardId!, 'failed')).toBe(true); });
  expect(sale.order).not.toHaveProperty('cashRoundings');
  expect(sale.order.totalMinor).toBe(3125);
});

it('R7: an entry on a pending leg is dead, stays dead when it fails, and lives once a leg is captured', () => {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 0 } });
  builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 3125, currency: 'EUR' } });
  const pending = builder.addPayment({ method: 'external', amountMinor: 3120, status: 'pending' });
  builder.addCashRounding({ paymentId: pending, minor: -5 });
  expect(builder.getSnapshot()).toMatchObject({ totalMinor: 3125, balanceDueMinor: 3125 });
  expect(builder.getSnapshot()).not.toHaveProperty('cashRoundings');
  builder.setPaymentStatus(pending, 'failed');
  expect(builder.getSnapshot().totalMinor).toBe(3125);
  const second = builder.addPayment({ method: 'external', amountMinor: 3120, status: 'pending' });
  builder.addCashRounding({ paymentId: second, minor: -5 });
  expect(builder.getSnapshot().totalMinor).toBe(3125);
  builder.setPaymentStatus(second, 'captured', '2026-11-22T10:00:00.000Z');
  expect(builder.getSnapshot()).toMatchObject({ totalMinor: 3120, paidMinor: 3120, balanceDueMinor: 0, cashRoundings: [{ paymentId: second, minor: -5 }] });
});

it('R7c: with a leg in motion, a cash leg that is not a whole number of cash steps is refused', () => {
  start(2, rounding(nearest), carries);
  enter(1000);
  press('tender-take');
  expect(sale.order.payments).toMatchObject([{ method: 'cash', amountMinor: 1000, tenderedMinor: 1000, changeMinor: 0 }]);
  let cardId: string | null = null;
  act(() => { cardId = sale.addTender({ method: 'external', amountMinor: 2123, status: 'pending' }); });
  expect(screen.queryByTestId('tender-tendered-line')).toBeNull();
  enter(2130);
  expect(disabled('tender-take')).toBe(true);
  expect(text('tender-entry-hint')).toBe(CASH_WAITS_FOR_PAYMENT);
  expect(screen.queryByTestId('tender-tendered-line')).toBeNull();
  act(() => { expect(sale.addTender({ method: 'cash', amountMinor: 2130, rounding: nearest })).toBeNull(); });
  expect(sale.error).toBe(CASH_WAITS_FOR_PAYMENT);
  expect(sale.order.payments).toHaveLength(2);
  expect(sale.order).not.toHaveProperty('cashRoundings');
  act(() => { expect(sale.setTenderStatus(cardId!, 'failed')).toBe(true); });
  act(() => { expect(sale.addTender({ method: 'cash', amountMinor: 2130, rounding: nearest })).toBeTypeOf('string'); });
});

it('R7d: with no leg in motion a split\'s zero remainder still rounds: entry -2 on the card leg', () => {
  start(2, rounding(nearest), carries);
  enter(1000);
  press('tender-take');
  let cardId: string | null = null;
  act(() => { cardId = sale.addTender({ method: 'external', amountMinor: 2123 }); });
  expect(sale.order.balanceDueMinor).toBe(2);
  expect(text('tender-entry-amount')).toBe(money(0));
  press('tender-take');
  expect(sale.order.payments).toHaveLength(2);
  expect(sale.order.cashRoundings).toEqual([{ paymentId: cardId, minor: -2 }]);
  expect(sale.order).toMatchObject({ totalMinor: 3123, balanceDueMinor: 0 });
});

it('R7e: after the pending card captures, Take at zero writes off the remainder on that card', () => {
  start(2, rounding(nearest), carries);
  enter(1000);
  press('tender-take');
  let cardId: string | null = null;
  act(() => { cardId = sale.addTender({ method: 'external', amountMinor: 2123, status: 'pending' }); });
  enter(2130);
  expect(disabled('tender-take')).toBe(true);
  expect(text('tender-entry-hint')).toBe(CASH_WAITS_FOR_PAYMENT);
  act(() => { expect(sale.addTender({ method: 'cash', amountMinor: 2130, rounding: nearest })).toBeNull(); });
  expect(sale.error).toBe(CASH_WAITS_FOR_PAYMENT);
  expect(sale.order.payments).toHaveLength(2);
  expect(sale.order).not.toHaveProperty('cashRoundings');
  act(() => { expect(sale.setTenderStatus(cardId!, 'captured')).toBe(true); });
  expect(sale.order.balanceDueMinor).toBe(2);
  enter(0);
  expect(disabled('tender-take')).toBe(false);
  press('tender-take');
  expect(sale.order.cashRoundings).toEqual([{ paymentId: cardId, minor: -2 }]);
  expect(sale.order).toMatchObject({ totalMinor: 3123, balanceDueMinor: 0 });
});

it('R7f: a part payment while a leg is in motion must be a whole number of cash steps', () => {
  start(2, rounding(nearest), carries);
  act(() => { sale.addTender({ method: 'external', amountMinor: 2123, status: 'pending' }); });
  enter(502);
  expect(disabled('tender-take')).toBe(true);
  expect(text('tender-entry-hint')).toBe(CASH_WAITS_FOR_PAYMENT);
  act(() => { expect(sale.addTender({ method: 'cash', amountMinor: 502, rounding: nearest })).toBeNull(); });
  enter(1000);
  expect(disabled('tender-take')).toBe(false);
  press('tender-take');
  expect(sale.order.payments[1]).toMatchObject({ method: 'cash', amountMinor: 1000, tenderedMinor: 1000, changeMinor: 0 });
});

const five: PaymentRounding = { incrementMinor: 5, mode: 'nearest' };

it('10.08 (desk): the void of a cash leg is allowed when only a card carries a later entry', () => {
  startCustom(1008, [rounding(five)[0], { ...card, capabilities: { ...card.capabilities, void: false } }], carries);
  let part = '', cashA = '', cardId = '';
  act(() => { part = sale.addTender({ method: 'cash', amountMinor: 500 })!; });
  act(() => { cashA = sale.addTender({ method: 'cash', amountMinor: 510, rounding: five })!; });
  act(() => { expect(sale.voidTender(part)).toBe(true); });
  act(() => { cardId = sale.addTender({ method: 'external', amountMinor: 497 })!; });
  act(() => { sale.addTender({ method: 'cash', amountMinor: 0, rounding: five }); });
  expect(sale.order.cashRoundings).toEqual([{ paymentId: cashA, minor: 2 }, { paymentId: cardId, minor: -3 }]);
  act(() => { expect(sale.voidTender(cashA)).toBe(true); });
  expect(legStatus(sale.order.payments.find((leg) => leg.id === cardId)!)).toBe('captured');
  expect(Math.abs((sale.order.cashRoundings ?? []).reduce((sum, entry) => sum + entry.minor, 0))).toBeLessThan(5);
});

it('10.08 (desk): Cancel and void finishes with a card the till cannot void', () => {
  startCustom(1008, [rounding(five)[0], { ...card, capabilities: { ...card.capabilities, void: false } }], carries);
  let part = '', cashA = '', cardId = '';
  act(() => { part = sale.addTender({ method: 'cash', amountMinor: 500 })!; });
  act(() => { cashA = sale.addTender({ method: 'cash', amountMinor: 510, rounding: five })!; });
  act(() => { expect(sale.voidTender(part)).toBe(true); });
  act(() => { cardId = sale.addTender({ method: 'external', amountMinor: 497 })!; });
  act(() => { sale.addTender({ method: 'cash', amountMinor: 0, rounding: five }); });
  fireEvent.click(screen.getByText('Back'));
  press('tender-cancel-confirm');
  expect(sale.stage.kind).toBe('cart');
  expect(sale.order.payments.find((leg) => leg.id === cashA)?.status).toBe('voided');
  expect(legStatus(sale.order.payments.find((leg) => leg.id === cardId)!)).toBe('captured');
});

it('S8 (i): Cancel and void voids latest first and reaches the cart', async () => {
  const beforeVoid = vi.fn<NonNullable<Parameters<typeof Tender>[0]['beforeVoid']>>(() => undefined);
  startCustom(1003, rounding(five), carries, beforeVoid);
  let cardId = '', cashA = '', cashB = '';
  act(() => { cardId = sale.addTender({ method: 'external', amountMinor: 501 })!; });
  act(() => { cashA = sale.addTender({ method: 'cash', amountMinor: 500, rounding: five })!; });
  act(() => { expect(sale.voidTender(cardId)).toBe(true); });
  act(() => { cashB = sale.addTender({ method: 'cash', amountMinor: 505, rounding: five })!; });
  fireEvent.click(screen.getByText('Back'));
  await act(async () => { press('tender-cancel-confirm'); });
  expect(beforeVoid.mock.calls.map(([leg]) => leg.id)).toEqual([cashB, cashA]);
  expect(sale.order.payments.filter((leg) => leg.method === 'cash').map((leg) => leg.status)).toEqual(['voided', 'voided']);
  expect(sale.stage.kind).toBe('cart');
  expect(sale.order.cashRoundings).toBeUndefined();
});

it('S8 (i): a refused void from the ledger never reaches beforeVoid', async () => {
  const journal: string[] = [];
  const beforeVoid = vi.fn<NonNullable<Parameters<typeof Tender>[0]['beforeVoid']>>((leg) => { journal.push(leg.id); });
  startCustom(1003, rounding(five), carries, beforeVoid);
  let cardId = '', cashA = '';
  act(() => { cardId = sale.addTender({ method: 'external', amountMinor: 501 })!; });
  act(() => { cashA = sale.addTender({ method: 'cash', amountMinor: 500, rounding: five })!; });
  act(() => { expect(sale.voidTender(cardId)).toBe(true); });
  act(() => { sale.addTender({ method: 'cash', amountMinor: 505, rounding: five }); });
  await act(async () => { press(`tender-leg-${cashA}-void`); });
  expect(journal).toEqual([]);
  expect(sale.error).toBe(VOID_LATER_CASH_FIRST);
  expect(sale.order.payments.find((leg) => leg.id === cashA)?.status).not.toBe('voided');
});

it('S8 (i): Cancel and void never journals a void the core refuses', async () => {
  const journal: string[] = [];
  const beforeVoid = vi.fn<NonNullable<Parameters<typeof Tender>[0]['beforeVoid']>>((leg) => { journal.push(leg.id); });
  const nonVoidableCash = { ...rounding(five)[0], id: 'cash-no-void', title: 'Cash without void', capabilities: { ...cash.capabilities, void: false } };
  startCustom(1003, [...rounding(five), nonVoidableCash], carries, beforeVoid);
  let cardId = '', cashA = '', cashB = '';
  act(() => { cardId = sale.addTender({ method: 'external', amountMinor: 501 })!; });
  act(() => { cashA = sale.addTender({ method: 'cash', amountMinor: 500, rounding: five })!; });
  act(() => { expect(sale.voidTender(cardId)).toBe(true); });
  act(() => { cashB = sale.addTender({ method: 'cash', methodId: nonVoidableCash.id, amountMinor: 505, rounding: five })!; });
  expect(sale.order.cashRoundings).toEqual([{ paymentId: cashA, minor: -2 }, { paymentId: cashB, minor: 4 }]);
  fireEvent.click(screen.getByText('Back'));
  await act(async () => { press('tender-cancel-confirm'); });
  expect(journal).toEqual([]);
  expect(sale.error).toBe(VOID_LATER_CASH_FIRST);
  expect(sale.order.payments.find((leg) => leg.id === cashA)?.status).not.toBe('voided');
  expect(sale.order.payments.find((leg) => leg.id === cashB)?.status).not.toBe('voided');
});

function mulberry32(seed: number) {
  return () => {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

it('property (desk): a closed sale\'s entries stay under one increment; an open sale can always close or cancel', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const random = mulberry32(seed);
    const rule: PaymentRounding = { incrementMinor: 5, mode: (['nearest', 'up', 'down'] as const)[Math.floor(random() * 3)] };
    const price = 1000 + Math.floor(random() * 1000);
    const steps: string[] = [`${rule.mode}, price ${price}`];
    startCustom(price, rounding(rule), carries);
    for (let step = 0; step < 14; step++) {
      const choice = Math.floor(random() * 6);
      const due = sale.order.balanceDueMinor;
      const live = sale.order.payments.filter(countsTowardPaid);
      if (choice === 5 && live.length) {
        const leg = live[Math.floor(random() * live.length)];
        act(() => { steps.push(`void payment ${sale.order.payments.indexOf(leg)}: ${sale.voidTender(leg.id)}`); });
      } else if (choice < 5 && due > 0 && (choice !== 0 || due > 1)) {
        const amountMinor = choice === 0 ? 1 + Math.floor(random() * (due - 1))
          : choice === 1 ? due : choice === 2 ? due + 10 : choice === 3 ? 0 : 1 + Math.floor(random() * due);
        const method = choice === 4 ? 'external' : 'cash';
        steps.push(`${method} ${amountMinor} (due ${due})`);
        act(() => { sale.addTender({ method, amountMinor, ...(method === 'cash' ? { rounding: rule } : {}) }); });
      } else steps.push(`skip ${choice} (due ${due})`);
      const sum = (sale.order.cashRoundings ?? []).reduce((sum, entry) => sum + entry.minor, 0);
      const remaining = sale.order.payments.filter(countsTowardPaid);
      const message = `seed ${seed}: ${steps.join('; ')}`;
      if (sale.order.balanceDueMinor === 0 && remaining.length) {
        expect(sale.order.paidMinor - price, message).toBe(sum);
        expect(Math.abs(sum), message).toBeLessThan(5);
      } else expect(cancelRefusedLeg(sale.order, remaining), message).toBeUndefined();
    }
    if (seed % 2 === 0 && !(sale.order.balanceDueMinor === 0 && sale.order.payments.some(countsTowardPaid))) {
      const amountMinor = sale.order.balanceDueMinor + 10;
      steps.push(`closing cash ${amountMinor} (due ${sale.order.balanceDueMinor})`);
      act(() => { sale.addTender({ method: 'cash', amountMinor, rounding: rule }); });
      const message = `seed ${seed}: ${steps.join('; ')}`;
      const sum = (sale.order.cashRoundings ?? []).reduce((sum, entry) => sum + entry.minor, 0);
      expect(sale.order.balanceDueMinor, message).toBe(0);
      expect(sale.order.payments.some(countsTowardPaid), message).toBe(true);
      expect(sale.order.paidMinor - price, message).toBe(sum);
      expect(Math.abs(sum), message).toBeLessThan(5);
    } else if (seed % 2 === 1) {
      for (const leg of sale.order.payments.filter(countsTowardPaid).reverse()) {
        steps.push(`cancel: void payment ${sale.order.payments.indexOf(leg)}`);
        act(() => { expect(sale.voidTender(leg.id), `seed ${seed}: ${steps.join('; ')}`).toBe(true); });
      }
    }
    cleanup();
  }
}, 120_000);

it('1012 (desk review): a reopened write-off may carry -6 while open; cash 5 closes it at -2', () => {
  startCustom(1012, rounding(five), carries);
  const steps: string[] = ['nearest, price 1012'];
  let card10 = '', cash1000 = '', card9 = '', cash5 = '', card5 = '';
  steps.push('card 10'); act(() => { card10 = sale.addTender({ method: 'external', amountMinor: 10 })!; });
  steps.push('cash 1000'); act(() => { cash1000 = sale.addTender({ method: 'cash', amountMinor: 1000, rounding: five })!; });
  steps.push('void card 10'); act(() => { expect(sale.voidTender(card10), steps.join('; ')).toBe(true); });
  steps.push('card 9'); act(() => { card9 = sale.addTender({ method: 'external', amountMinor: 9 })!; });
  steps.push('cash 5'); act(() => { cash5 = sale.addTender({ method: 'cash', amountMinor: 5, rounding: five })!; });
  steps.push('void card 9'); act(() => { expect(sale.voidTender(card9), steps.join('; ')).toBe(true); });
  steps.push('card 5'); act(() => { card5 = sale.addTender({ method: 'external', amountMinor: 5 })!; });
  steps.push('cash 0'); act(() => { sale.addTender({ method: 'cash', amountMinor: 0, rounding: five }); });
  expect(sale.order.balanceDueMinor, steps.join('; ')).toBe(0);
  expect(sale.order.cashRoundings, steps.join('; ')).toEqual([{ paymentId: cash1000, minor: -2 }, { paymentId: cash5, minor: 4 }, { paymentId: card5, minor: -4 }]);
  expect((sale.order.cashRoundings ?? []).reduce((sum, entry) => sum + entry.minor, 0), steps.join('; ')).toBe(-2);
  expect(sale.order.paidMinor - 1012, steps.join('; ')).toBe(-2);
  steps.push('void cash 5'); act(() => { expect(sale.voidTender(cash5), steps.join('; ')).toBe(true); });
  expect((sale.order.cashRoundings ?? []).reduce((sum, entry) => sum + entry.minor, 0), steps.join('; ')).toBe(-6);
  expect(sale.order.balanceDueMinor, steps.join('; ')).toBe(1);
  steps.push('cash 5'); act(() => { sale.addTender({ method: 'cash', amountMinor: 5, rounding: five }); });
  expect(sale.order.balanceDueMinor, steps.join('; ')).toBe(0);
  expect((sale.order.cashRoundings ?? []).reduce((sum, entry) => sum + entry.minor, 0), steps.join('; ')).toBe(-2);
  expect(sale.order.paidMinor - 1012, steps.join('; ')).toBe(-2);
});

it('S7: without cashRounding, the due the pane shows is the due the leg takes', () => {
  startCustom(1002, rounding(five), { orderCreate: 12 });
  const shown = text('tender-entry-amount');
  press('tender-take');
  const [leg] = sale.order.payments;
  expect(money(leg.amountMinor)).toBe(shown);
  // At 10.02 and 5c the pane must not show 10.00 while the leg leaves 0.02 due.
  expect(sale.order.balanceDueMinor).toBe(0);
});

it('#1277: with cashRounding, a non-cash method with a rounding increment shows and takes the exact due', () => {
  startCustom(1002, [cash, { ...card, defaults: { ...card.defaults, rounding: five } }], carries);
  press('tender-method-external');
  expect(text('tender-entry-amount')).toBe(money(1002));
  press('tender-take');
  expect(sale.order.payments).toHaveLength(1);
  expect(sale.order.payments[0]).toMatchObject({ method: 'external', amountMinor: 1002 });
  expect(sale.order.balanceDueMinor).toBe(0);
  expect(sale.order.cashRoundings ?? []).toEqual([]);
});

// This refusal applies only when no items are picked; a full pick keeps its own rule (W19 in tender-picks.test.tsx).
it('P1: typed cash 2.01 below the rounded due is refused with payable alternatives', () => {
  startCustom(1003, rounding(five), carries);
  act(() => { sale.addTender({ method: 'external', amountMinor: 501 }); });
  enter(201);
  expect.soft(disabled('tender-take')).toBe(true);
  expect.soft(text('tender-entry-hint')).toBe(`Cash cannot pay that exactly. Take ${money(200)} or ${money(205)}.`);
  expect.soft(screen.queryByTestId('tender-payable-below')?.textContent).toBe(money(200));
  expect.soft(screen.queryByTestId('tender-payable-above')?.textContent).toBe(money(205));
  let result: string | null = null;
  act(() => { result = sale.addTender({ method: 'cash', amountMinor: 201, rounding: five }); });
  expect.soft(result).toBeNull();
  expect.soft(sale.error).toBe(CASH_NOT_PAYABLE);
  expect(sale.order.payments).toMatchObject([{ method: 'external', amountMinor: 501 }]);
  expect(sale.order.payments).toHaveLength(1);
});

it('P2: typed cash 2.00 is taken exactly as a part payment without rounding', () => {
  startCustom(1003, rounding(five), carries);
  act(() => { sale.addTender({ method: 'external', amountMinor: 501 }); });
  enter(200);
  expect(disabled('tender-take')).toBe(false);
  press('tender-take');
  expect(sale.order.payments[1]).toMatchObject({ method: 'cash', amountMinor: 200, tenderedMinor: 200, changeMinor: 0 });
  expect(sale.order.cashRoundings ?? []).toEqual([]);
  expect(sale.order.balanceDueMinor).toBe(302);
});

it('P3: typed cash 5.10 settles at 5.00 with 0.10 change', () => {
  startCustom(1003, rounding(five), carries);
  act(() => { sale.addTender({ method: 'external', amountMinor: 501 }); });
  enter(510);
  expect(disabled('tender-take')).toBe(false);
  press('tender-take');
  expect(sale.order.payments[1]).toMatchObject({ method: 'cash', amountMinor: 500, tenderedMinor: 510, changeMinor: 10 });
  expect(sale.order.cashRoundings).toEqual([{ paymentId: sale.order.payments[1].id, minor: -2 }]);
  expect(sale.order.balanceDueMinor).toBe(0);
});

it('P4: without cashRounding, typed cash 2.01 remains a 2.01 part payment', () => {
  startCustom(1003, rounding(five), { orderCreate: 12 });
  act(() => { sale.addTender({ method: 'external', amountMinor: 501 }); });
  enter(201);
  expect(disabled('tender-take')).toBe(false);
  press('tender-take');
  expect(sale.order.payments[1]).toMatchObject({ method: 'cash', amountMinor: 201, tenderedMinor: 201, changeMinor: 0 });
  expect(sale.order.cashRoundings ?? []).toEqual([]);
  expect(sale.order.balanceDueMinor).toBe(301);
});

it('P5: the payable above chip sets 2.05 and enables confirm', () => {
  startCustom(1003, rounding(five), carries);
  act(() => { sale.addTender({ method: 'external', amountMinor: 501 }); });
  enter(201);
  press('tender-payable-above');
  expect(text('tender-entry-amount')).toBe(money(205));
  expect(tender.state.entryMinor).toBe(205);
  expect(disabled('tender-take')).toBe(false);
});

it('P6: an untouched cash plan share is refused with payable alternatives', () => {
  startCustom(1003, rounding(five), carries);
  press('tender-split-chip');
  press('tender-split-even-2');
  expect(tender.state.entryMinor).toBe(502);
  expect(tender.state.entryDirty).toBe(false);
  expect(disabled('tender-take')).toBe(true);
  expect(text('tender-entry-hint')).toBe(`Cash cannot pay that exactly. Take ${money(500)} or ${money(505)}.`);
  expect(screen.getByTestId('tender-payable-below').textContent).toBe(money(500));
  expect(screen.getByTestId('tender-payable-above').textContent).toBe(money(505));
  press('tender-payable-below');
  press('tender-take');
  expect(sale.order.payments).toHaveLength(1);
  expect(sale.order.payments[0]).toMatchObject({ method: 'cash', amountMinor: 500, tenderedMinor: 500, changeMinor: 0 });
  expect(sale.order.cashRoundings ?? []).toEqual([]);
});

it('P7: cash below the smallest step offers only the payable amount above', () => {
  startCustom(1003, rounding(five), carries);
  act(() => { sale.addTender({ method: 'external', amountMinor: 501 }); });
  enter(3);
  expect(text('tender-entry-hint')).toBe(`Cash cannot pay that exactly. Take ${money(5)}.`);
  expect(screen.queryByTestId('tender-payable-below')).toBeNull();
  expect(screen.getByTestId('tender-payable-above').textContent).toBe(money(5));
});

it('P8: a settling non-multiple takes the rounded due and gives change', () => {
  startCustom(1003, rounding(five), carries);
  act(() => { sale.addTender({ method: 'external', amountMinor: 501 }); });
  enter(501);
  expect(disabled('tender-take')).toBe(false);
  press('tender-take');
  expect(sale.order.payments[1]).toMatchObject({ method: 'cash', amountMinor: 500, tenderedMinor: 501, changeMinor: 1 });
  expect(sale.order.cashRoundings).toEqual([{ paymentId: sale.order.payments[1].id, minor: -2 }]);
  expect(sale.order.balanceDueMinor).toBe(0);
});

it('P9: up rounding refuses a short non-multiple in the pane and core', () => {
  const rule: PaymentRounding = { incrementMinor: 5, mode: 'up' };
  startCustom(1003, rounding(rule), carries);
  act(() => { sale.addTender({ method: 'external', amountMinor: 501 }); });
  enter(201);
  expect(disabled('tender-take')).toBe(true);
  expect(text('tender-entry-hint')).toBe(`Cash cannot pay that exactly. Take ${money(200)} or ${money(205)}.`);
  let result: string | null = null;
  act(() => { result = sale.addTender({ method: 'cash', amountMinor: 201, rounding: rule }); });
  expect(result).toBeNull();
  expect(sale.error).toBe(CASH_NOT_PAYABLE);
});

it('P10: an untouched cash due without a plan stays payable', () => {
  startCustom(1003, rounding(five), carries);
  act(() => { sale.addTender({ method: 'external', amountMinor: 501 }); });
  press('tender-method-cash');
  expect(tender.state.plan).toBeNull();
  expect(tender.state.entryDirty).toBe(false);
  expect(disabled('tender-take')).toBe(false);
  expect(screen.queryByTestId('tender-payable-above')).toBeNull();
});

it('S8: a void between two cash settles still rounds the sale once (10.03 takes 10.05 in cash)', () => {
  startCustom(1003, rounding(five), carries);
  let cardId: string | null = null;
  act(() => { cardId = sale.addTender({ method: 'external', amountMinor: 501 }); });
  // Cash settles 5.02 as 5.00: entry -2.
  let firstCash: string | null = null;
  act(() => { firstCash = sale.addTender({ method: 'cash', amountMinor: 500, rounding: five }); });
  expect(firstCash).toEqual(expect.any(String));
  expect(sale.order.balanceDueMinor).toBe(0);
  act(() => { expect(sale.voidTender(cardId!)).toBe(true); });
  // The customer hands 5.05 for the rest.
  let secondCash: string | null = null;
  act(() => { secondCash = sale.addTender({ method: 'cash', amountMinor: 505, rounding: five }); });
  const cashTaken = sale.order.payments.filter((p) => p.method === 'cash' && p.status !== 'voided').reduce((sum, p) => sum + p.amountMinor, 0);
  expect(sale.order.balanceDueMinor).toBe(0);
  expect({ cashTaken, totalMinor: sale.order.totalMinor }).toEqual({ cashTaken: 1005, totalMinor: 1005 });
  // Invariant 3: the first entry is not rewritten; only the new leg's entry is computed.
  expect(sale.order.cashRoundings).toEqual([{ paymentId: firstCash, minor: -2 }, { paymentId: secondCash, minor: 4 }]);
  // Invariant 2: voiding the new leg takes its entry out of the sum.
  act(() => { expect(sale.voidTender(secondCash!)).toBe(true); });
  expect(sale.order.cashRoundings).toEqual([{ paymentId: firstCash, minor: -2 }]);
  expect(sale.order.balanceDueMinor).toBe(501);
});

it('S8: after the void the pane shows and takes the sale\'s single rounding', () => {
  startCustom(1003, rounding(five), carries);
  let cardId: string | null = null;
  act(() => { cardId = sale.addTender({ method: 'external', amountMinor: 501 }); });
  let firstCash: string | null = null;
  act(() => { firstCash = sale.addTender({ method: 'cash', amountMinor: 500, rounding: five }); });
  expect(firstCash).toEqual(expect.any(String));
  expect(sale.order.balanceDueMinor).toBe(0);
  act(() => { expect(sale.voidTender(cardId!)).toBe(true); });
  expect(text('tender-entry-amount')).toBe(money(505));
  press('tender-take');
  expect(sale.order).toMatchObject({ balanceDueMinor: 0, totalMinor: 1005 });
  const liveCash = sale.order.payments.filter((p) => p.method === 'cash' && p.status !== 'voided');
  for (const leg of liveCash) expect(leg.amountMinor % 5).toBe(0);
  expect((sale.order.cashRoundings ?? []).reduce((sum, e) => sum + e.minor, 0)).toBe(2);
});

it('S8 (i): a void that a later entry was computed against is refused; voiding the later cash first unwinds to zero', () => {
  startCustom(1003, rounding(five), carries);
  let cardId: string | null = null;
  act(() => { cardId = sale.addTender({ method: 'external', amountMinor: 501 }); });
  let cashA: string | null = null;
  act(() => { cashA = sale.addTender({ method: 'cash', amountMinor: 500, rounding: five }); });
  act(() => { expect(sale.voidTender(cardId!)).toBe(true); });
  let cashB: string | null = null;
  act(() => { cashB = sale.addTender({ method: 'cash', amountMinor: 505, rounding: five }); });
  expect(sale.order.cashRoundings).toEqual([{ paymentId: cashA, minor: -2 }, { paymentId: cashB, minor: 4 }]);
  act(() => { expect(sale.voidTender(cashA!)).toBe(false); });
  expect(sale.error).toBe(VOID_LATER_CASH_FIRST);
  expect(sale.order.payments.find((p) => p.id === cashA)?.status).not.toBe('voided');
  expect(sale.order.cashRoundings).toEqual([{ paymentId: cashA, minor: -2 }, { paymentId: cashB, minor: 4 }]);
  // The later leg is never refused, so the sale cannot be stranded.
  act(() => { expect(sale.voidTender(cashB!)).toBe(true); });
  act(() => { expect(sale.voidTender(cashA!)).toBe(true); });
  expect((sale.order.cashRoundings ?? []).reduce((sum, e) => sum + e.minor, 0)).toBe(0);
  expect(sale.order.balanceDueMinor).toBe(1003);
});

it('S8 (i): a later cash leg with no entry does not block the void', () => {
  startCustom(1003, rounding(five), carries);
  let cardId: string | null = null;
  act(() => { cardId = sale.addTender({ method: 'external', amountMinor: 501 }); });
  let cashA: string | null = null;
  act(() => { cashA = sale.addTender({ method: 'cash', amountMinor: 500, rounding: five }); });
  act(() => { expect(sale.voidTender(cardId!)).toBe(true); });
  // A part payment is never rounded (R5), so cash B carries no entry.
  act(() => { sale.addTender({ method: 'cash', amountMinor: 200, rounding: five }); });
  expect(sale.order.cashRoundings).toEqual([{ paymentId: cashA, minor: -2 }]);
  act(() => { expect(sale.voidTender(cashA!)).toBe(true); });
  expect(sale.order.cashRoundings).toBeUndefined();
  expect(sale.order.balanceDueMinor).toBe(803);
});

it('S8 (i): the refused void shows the translated string in the pane', () => {
  // Drive the same sequence, then the pane's error line reads the catalogue's English.
  startCustom(1003, rounding(five), carries);
  let cardId: string | null = null;
  act(() => { cardId = sale.addTender({ method: 'external', amountMinor: 501 }); });
  let cashA: string | null = null;
  act(() => { cashA = sale.addTender({ method: 'cash', amountMinor: 500, rounding: five }); });
  act(() => { expect(sale.voidTender(cardId!)).toBe(true); });
  act(() => { sale.addTender({ method: 'cash', amountMinor: 505, rounding: five }); });
  act(() => { expect(sale.voidTender(cashA!)).toBe(false); });
  expect(screen.getAllByRole('alert').map((node) => node.textContent)).toContain('Void the later cash payment first.');
});

it('invariant 1: with a live card and no prior cash the cash leg takes a payable 5.00', () => {
  startCustom(1003, rounding(five), carries);
  act(() => { sale.addTender({ method: 'external', amountMinor: 501 }); });
  expect(text('tender-entry-amount')).toBe(money(500));
  press('tender-take');
  const leg = sale.order.payments.find((p) => p.method === 'cash')!;
  expect(leg).toMatchObject({ method: 'cash', amountMinor: 500 });
  expect(sale.order.cashRoundings).toEqual([{ paymentId: leg.id, minor: -2 }]);
  expect(sale.order).toMatchObject({ totalMinor: 1001, balanceDueMinor: 0 });
});

it('a card-only completion after a cash leg adds no rounding entry', () => {
  startCustom(1003, rounding(five), carries);
  let cardId: string | null = null;
  act(() => { cardId = sale.addTender({ method: 'external', amountMinor: 501 }); });
  let firstCash: string | null = null;
  act(() => { firstCash = sale.addTender({ method: 'cash', amountMinor: 500, rounding: five }); });
  expect(firstCash).toEqual(expect.any(String));
  expect(sale.order.balanceDueMinor).toBe(0);
  act(() => { expect(sale.voidTender(cardId!)).toBe(true); });
  act(() => { expect(sale.addTender({ method: 'external', amountMinor: 501 })).toEqual(expect.any(String)); });
  expect(sale.order.cashRoundings).toEqual([{ paymentId: firstCash, minor: -2 }]);
  expect(sale.order).toMatchObject({ totalMinor: 1001, balanceDueMinor: 0 });
});

it('R8: reopen keeps the stored entries as stored', async () => {
  roundUp();
  const draft = await reopened(await complete());
  expect(draft).toMatchObject({ totalMinor: 3130, paidMinor: 3130, balanceDueMinor: 0 });
  expect(draft.cashRoundings).toEqual([{ paymentId: draft.payments[0].id, minor: 5 }]);
});

it('R8b: a reopened sale settled again by cash adds its own entry', async () => {
  roundUp();
  const draft = await reopened(await complete());
  cleanup();
  // Built at builder level (amendment 11): useSale refuses a new line while the reopened leg is live.
  const builder = restoreOrderDraft(draft, { currency: 'EUR', taxContext, keepTaxRates: true });
  builder.addLine({ productId: 'custom', name: 'Extra', custom: true, taxStatus: 'none', unitPrice: { amount: 245, currency: 'EUR' } });
  await writeOrderDraft(db!.pos_drafts, builder.getSnapshot());
  renderTill(db!.pos_drafts, rounding(nearest));
  await act(async () => { expect(await till.resume(draft.id)).toBeNull(); });
  act(() => till.startTender('cash'));
  expect(text('tender-entry-amount')).toBe(money(240));
  press('tender-take');
  // By hand: total 3125 + 245 + 5 - 5 = 3370, the sale rounded once (desk, 2026-11-24); paid 3130 (reopened) + 240 (the new cash leg) = 3370.
  const [first, second] = till.order.payments;
  expect(second).toMatchObject({ method: 'cash', amountMinor: 240, tenderedMinor: 240, changeMinor: 0 });
  expect(till.order.cashRoundings).toEqual([{ paymentId: first.id, minor: 5 }, { paymentId: second.id, minor: -5 }]);
  expect(till.order).toMatchObject({ totalMinor: 3370, paidMinor: 3370, balanceDueMinor: 0 });
  await act(async () => { await till.complete(); });
  expect(till.stage.kind).toBe('receipt');
});

it('R8c: reopen drops an entry whose stored leg is not found', async () => {
  const leg = roundUp();
  const posOrder = await complete();
  const draft = await reopened({ ...posOrder, cashRoundings: [{ paymentId: posOrder.payments[0].id, minor: 5 }, { paymentId: 'missing-leg', minor: 3 }] });
  expect(leg.id).toBeTruthy();
  expect(draft.cashRoundings).toEqual([{ paymentId: draft.payments[0].id, minor: 5 }]);
  expect(draft.totalMinor).toBe(3130);
});

it('R9: park and resume keep the entries as stored', async () => {
  const { pos_drafts } = await database();
  renderTill(pos_drafts, rounding(nearest));
  act(() => till.add(blue, traits));
  act(() => till.setQuantity(till.order.lineItems[0].id, 2));
  act(() => till.startTender('cash'));
  press('tender-take');
  const [leg] = till.order.payments;
  expect(till.order.cashRoundings).toEqual([{ paymentId: leg.id, minor: 5 }]);
  const id = till.order.id;
  act(() => till.cancelTender());
  await act(async () => { expect(await till.park()).toBeNull(); });
  await act(async () => { expect(await till.resume(id)).toBeNull(); });
  expect(till.order.cashRoundings).toEqual([{ paymentId: leg.id, minor: 5 }]);
  expect(till.order.totalMinor).toBe(3130);
});

it('R10: the register counts the rounded due as cash taken', async () => {
  roundUp();
  const posOrder = await complete();
  expect(Object.values(takingsByMethod([{ ...posOrder, sessionId: 's1' }], 's1'))).toEqual([{ amountMinor: 3130, count: 1 }]);
});

it('R11: a cash method without rounding is unchanged byte for byte', async () => {
  start(2, [cash, card], carries);
  enter(3130);
  press('tender-take');
  expect(sale.order.payments).toMatchObject([{ method: 'cash', amountMinor: 3125, tenderedMinor: 3130, changeMinor: 5 }]);
  expect('cashRoundings' in sale.order).toBe(false);
  const posOrder = await complete();
  expect('cashRoundings' in posOrder).toBe(false);
  const envelope = toOrderCreateEnvelope(posOrder, 'device-1');
  // Pinned at BASE a00e26c3: no maxVersion and no sentVersion, so the version is the order's base.
  expect(envelope).toEqual({
    attempt: 1, createdAt: expect.any(String), deviceId: 'device-1', id: expect.any(String), type: 'order.create', version: 3,
    payload: {
      cashierRef: 'cashier', clientOrderId: posOrder.id, createdAt: posOrder.createdAt, currency: 'EUR', customer: null,
      display: { currency: 'EUR', discountMinor: 0, exponent: 2, lines: [{ amountMinor: 2500, clientLineId: posOrder.lines[0].id, discounts: [] }],
        orderDiscountMinor: 0, subtotalMinor: 2500, taxInclusive: false, taxMinor: 625, totalMinor: 3125 },
      lines: [{ clientLineId: posOrder.lines[0].id, quantity: 2, title: 'Shirt', unitPriceMinor: 1250, variantId: 'blue' }],
      payments: [{ amountMinor: 3125, changeMinor: 5, clientPaymentId: posOrder.payments[0].id, method: 'cash', tenderedMinor: 3130 }],
      pricesIncludeTax: false, registerId: 'register-1', subtotalMinor: 2500,
      taxByRate: [{ grossMinor: 3125, netMinor: 2500, ratePpm: 250000, taxMinor: 625 }], taxMinor: 625, totalMinor: 3125,
    },
  });
});

it('R12: the receipt and the customer display show the rounding', async () => {
  roundUp();
  await complete();
  if (sale.stage.kind !== 'receipt') throw new Error('no receipt');
  const receipt = buildReceiptData(sale.stage.order, { storeName: 'Shop' });
  expect(receipt.rounding).toEqual({ name: 'Rounding', amountMinor: 5 });
  expect(receipt.totals.totalMinor).toBe(3130);
  expect(receipt.changeDueMinor).toBe(0);
  cleanup();
  render(<CustomerDisplayScreen state={{ config: {
    contract: '1.0', display: { id: 'd1', name: 'Counter' }, store: { id: 's1', name: 'Corner Shop', currency: 'EUR', locale: 'en-US' },
    presentation_hints: {}, i18n: { welcome: 'Hello there' }, idle: { afterCompleteMs: 8000 },
  }, view: { screen: 'cart', cart: displayCart(receipt) } }} />);
  expect(document.body.textContent).toContain(`Rounding${formatMoney({ amount: 5, currency: 'EUR' }, 'en-US')}`);
});

it.each(unflagged)('%s in motion: without cashRounding the 0.02 cash leg is still recorded', (_name, before) => {
  start(2, rounding(nearest), before);
  enter(1000);
  press('tender-take');
  act(() => { sale.addTender({ method: 'external', amountMinor: 2123, status: 'pending' }); });
  enter(2130);
  press('tender-take');
  expect(sale.order.payments[2]).toMatchObject({ method: 'cash', amountMinor: 2, tenderedMinor: 2130, changeMinor: 2128 });
});

it.each(unflagged)('%s up: without the cashRounding flag the pane does not round, and the stock-store sale completes with no cashRoundings (S7)', async (_name, before) => {
  start(2, rounding(nearest), before);
  expect(text('tender-entry-amount')).toBe(money(3125));
  expect(text('tender-entry-hint')).toBe('');
  expect(text('tender-take')).toBe(`Take ${money(3125)} in Cash`);
  press('tender-take');
  expect(sale.order.payments).toMatchObject([{ method: 'cash', amountMinor: 3125 }]);
  expect(sale.order.balanceDueMinor).toBe(0);
  expect('cashRoundings' in sale.order).toBe(false);
  const posOrder = await complete();
  expect(sale.stage.kind).toBe('receipt');
  expect(posOrder.totalMinor).toBe(3125);
  expect(posOrder.payments[0].amountMinor).toBe(3125);
  expect('cashRoundings' in posOrder).toBe(false);
});

it.each(unflagged)('%s down: without the cashRounding flag the pane takes the exact due and the sale completes (S7)', async (_name, before) => {
  startCustom(3122, rounding(nearest), before);
  expect(text('tender-entry-amount')).toBe(money(3122));
  expect(text('tender-take')).toBe(`Take ${money(3122)} in Cash`);
  press('tender-take');
  expect(sale.order.payments).toMatchObject([{ method: 'cash', amountMinor: 3122 }]);
  expect(sale.order.balanceDueMinor).toBe(0);
  expect('cashRoundings' in sale.order).toBe(false);
  await complete();
  expect(sale.stage.kind).toBe('receipt');
  expect(sale.error).toBeNull();
});

// Picks/legs follow-up (b), ADR-094 (desk ruling): a cash part pick rounds its own target and carries its own entry on a
// cashRounding store; a later cash remainder rounds only the remainder. Increment 0.05 unless a test says otherwise.
/** Untaxed custom lines in the tender stage; returns their line ids. */
function startLines(prices: number[], methods = rounding(five), capabilities = carries, settings = pricing) {
  render(<SaleHarness settings={settings} capabilities={capabilities}>{() => <SharedTender methods={methods} />}</SaleHarness>);
  for (const [i, priceMinor] of prices.entries()) {
    act(() => { expect(sale.addCustomLine({ name: `L${i}`, priceMinor, taxStatus: 'none' })).toMatchObject({ id: expect.any(String) }); });
  }
  act(() => sale.startTender('cash'));
  return sale.order.lineItems.map((line) => line.id);
}
const pickLine = (id: string) => { press('tender-split-chip'); act(() => tender.picker!.onPick(id, 1)); };
const lastLeg = () => sale.order.payments.at(-1)!;
/** Picks one unit of the line and takes it with `tenderedMinor` handed over. */
function cashPick(id: string, tenderedMinor: number) {
  pickLine(id);
  enter(tenderedMinor);
  press('tender-take');
  return lastLeg();
}
/** Condition (ii): the legs counting toward paid pay the items plus the entries, and so does the total. */
function balances(posOrder: PosOrder, itemsMinor: number) {
  const entries = (posOrder.cashRoundings ?? []).reduce((sum, entry) => sum + entry.minor, 0);
  expect(posOrder.payments.filter((leg) => countsTowardPaid(leg as Parameters<typeof countsTowardPaid>[0])).reduce((sum, leg) => sum + leg.amountMinor, 0)).toBe(itemsMinor + entries);
  expect(posOrder.totalMinor).toBe(itemsMinor + entries);
}

it('PK1: the desk sequence; a cash pick rounds its own target, the remainder settles with no second entry', async () => {
  const [a] = startLines([333, 670]);
  pickLine(a);
  enter(500);
  expect(text('tender-entry-hint')).toBe(`Change ${money(165)}`);
  press('tender-take');
  const leg = lastLeg();
  expect(leg).toMatchObject({ method: 'cash', amountMinor: 335, tenderedMinor: 500, changeMinor: 165 });
  expect(sale.order.cashRoundings).toEqual([{ paymentId: leg.id, minor: 2 }]);
  expect(sale.order.balanceDueMinor).toBe(670);
  press('tender-take');
  expect(sale.order.payments).toHaveLength(2);
  expect(lastLeg()).toMatchObject({ method: 'cash', amountMinor: 670 });
  expect(sale.order.cashRoundings).toEqual([{ paymentId: leg.id, minor: 2 }]);
  const posOrder = await complete();
  expect(posOrder.totalMinor).toBe(1005);
  expect(posOrder.cashRoundings?.map((entry) => entry.minor)).toEqual([2]);
  balances(posOrder, 1003);
});

it('PK2: two cash picks each carry their own entry, and the remainder rounds on its own', async () => {
  const [a, b] = startLines([333, 333, 334]);
  const first = cashPick(a, 500);
  expect(first).toMatchObject({ amountMinor: 335, changeMinor: 165 });
  const second = cashPick(b, 500);
  expect(second).toMatchObject({ amountMinor: 335, changeMinor: 165 });
  expect(sale.order.cashRoundings).toEqual([{ paymentId: first.id, minor: 2 }, { paymentId: second.id, minor: 2 }]);
  expect(sale.order.balanceDueMinor).toBe(334);
  press('tender-take');
  const rest = lastLeg();
  expect(rest).toMatchObject({ method: 'cash', amountMinor: 335 });
  expect(sale.order.cashRoundings).toEqual([{ paymentId: first.id, minor: 2 }, { paymentId: second.id, minor: 2 }, { paymentId: rest.id, minor: 1 }]);
  const posOrder = await complete();
  expect(posOrder.totalMinor).toBe(1005);
  expect(posOrder.cashRoundings?.map((entry) => entry.minor)).toEqual([2, 2, 1]);
  balances(posOrder, 1000);
});

it('PK3: a cash pick, then the remainder by card; the card is never rounded', async () => {
  const [a] = startLines([333, 670]);
  const leg = cashPick(a, 500);
  expect(leg).toMatchObject({ method: 'cash', amountMinor: 335 });
  press('tender-method-external');
  press('tender-take');
  const cardLeg = lastLeg();
  expect(cardLeg).toMatchObject({ method: 'external', amountMinor: 670 });
  expect(sale.order.cashRoundings).toEqual([{ paymentId: leg.id, minor: 2 }]);
  const posOrder = await complete();
  expect(posOrder.totalMinor).toBe(1005);
  balances(posOrder, 1003);
});

it('PK4: a card pick is never rounded; the cash remainder then rounds as usual', async () => {
  const [a] = startLines([333, 671]);
  press('tender-method-external');
  pickLine(a);
  press('tender-take');
  expect(lastLeg()).toMatchObject({ method: 'external', amountMinor: 333 });
  expect(sale.order.cashRoundings ?? []).toEqual([]);
  press('tender-method-cash');
  press('tender-take');
  const cashLeg = lastLeg();
  expect(cashLeg).toMatchObject({ method: 'cash', amountMinor: 670 });
  expect(sale.order.cashRoundings).toEqual([{ paymentId: cashLeg.id, minor: -1 }]);
  const posOrder = await complete();
  expect(posOrder.totalMinor).toBe(1003);
  balances(posOrder, 1004);
});

it('PK5: after a rounded pick the cash remainder rounds the remainder only (the ADR 3.33 + 3.33 example)', async () => {
  const [a] = startLines([333, 333]);
  const leg = cashPick(a, 500);
  expect(leg).toMatchObject({ amountMinor: 335 });
  expect(sale.order.cashRoundings).toEqual([{ paymentId: leg.id, minor: 2 }]);
  expect(sale.order.balanceDueMinor).toBe(333);
  expect(text('tender-entry-amount')).toBe(money(335));
  press('tender-take');
  const rest = lastLeg();
  expect(rest).toMatchObject({ method: 'cash', amountMinor: 335 });
  expect(sale.order.cashRoundings).toEqual([{ paymentId: leg.id, minor: 2 }, { paymentId: rest.id, minor: 2 }]);
  // One cash payment of the whole sale would be 6.65; the per-payer 6.70 is the ruling's accepted outcome.
  const posOrder = await complete();
  expect(posOrder.totalMinor).toBe(670);
  expect(posOrder.cashRoundings?.map((entry) => entry.minor)).toEqual([2, 2]);
  balances(posOrder, 666);
});

it('PK6: the void of a rounded pick leg reverses its entry', async () => {
  const [a] = startLines([333, 670]);
  const leg = cashPick(a, 500);
  expect(sale.order.cashRoundings).toEqual([{ paymentId: leg.id, minor: 2 }]);
  act(() => { expect(sale.voidTender(leg.id)).toBe(true); });
  expect(sale.order.cashRoundings ?? []).toEqual([]);
  expect(sale.order.balanceDueMinor).toBe(1003);
  expect(text('tender-entry-amount')).toBe(money(1005));
  press('tender-take');
  const whole = lastLeg();
  expect(whole).toMatchObject({ method: 'cash', amountMinor: 1005 });
  expect(sale.order.cashRoundings).toEqual([{ paymentId: whole.id, minor: 2 }]);
  const posOrder = await complete();
  expect(posOrder.totalMinor).toBe(1005);
  balances(posOrder, 1003);
});

it.each([
  ['JPY', 0, { incrementMinor: 10, mode: 'nearest' }, 333, 670, 500, 330, 1000],
  ['EUR', 2, five, 333, 670, 500, 335, 1005],
  ['KWD', 3, { incrementMinor: 5, mode: 'nearest' }, 3333, 6700, 5000, 3335, 10035],
] as [string, number, PaymentRounding, number, number, number, number, number][])(
  'PK7 %s (%i decimals): the pick rounds to its increment and the payable remainder carries no entry',
  async (currency, _digits, rule, aMinor, bMinor, tenderedMinor, pickMinor, totalMinor) => {
    const [a] = startLines([aMinor, bMinor], rounding(rule), carries, { ...pricing, currency });
    const leg = cashPick(a, tenderedMinor);
    expect(leg).toMatchObject({ method: 'cash', amountMinor: pickMinor, tenderedMinor, changeMinor: tenderedMinor - pickMinor });
    expect(sale.order.cashRoundings).toEqual([{ paymentId: leg.id, minor: pickMinor - aMinor }]);
    expect(sale.order.balanceDueMinor).toBe(bMinor);
    press('tender-take');
    expect(lastLeg()).toMatchObject({ method: 'cash', amountMinor: bMinor });
    expect(sale.order.cashRoundings).toHaveLength(1);
    const posOrder = await complete();
    expect(posOrder.totalMinor).toBe(totalMinor);
    balances(posOrder, aMinor + bMinor);
  },
);

it('PK8: a cash pick that rounds to nothing cannot be taken in cash', () => {
  const tens: PaymentRounding = { incrementMinor: 10, mode: 'nearest' };
  const [a] = startLines([3, 1000], rounding(tens));
  pickLine(a);
  expect(disabled('tender-take')).toBe(true);
  expect(text('tender-entry-hint')).toBe('Cash cannot pay for these items: they round to nothing. Take them by another method.');
  press('tender-take');
  expect(sale.order.payments).toEqual([]);
  act(() => { expect(sale.addTender({ method: 'cash', amountMinor: 3, tenderedMinor: 10, units: { [a]: 1 }, rounding: tens })).toBeNull(); });
  expect(sale.order.payments).toEqual([]);
});

// The desk's sequence on a store without the flag: the pick is not rounded, as before the fix.
it.each(unflagged)('PK0 %s: without the cashRounding flag a cash part pick is not rounded', async (_name, caps) => {
  render(<SaleHarness capabilities={caps}>{() => <SharedTender methods={rounding(five)} />}</SaleHarness>);
  act(() => { expect(sale.addCustomLine({ name: 'A', priceMinor: 333, taxStatus: 'none' })).toMatchObject({ id: expect.any(String) }); });
  act(() => { expect(sale.addCustomLine({ name: 'B', priceMinor: 670, taxStatus: 'none' })).toMatchObject({ id: expect.any(String) }); });
  act(() => sale.startTender('cash'));
  expect(sale.order.totalMinor).toBe(1003);
  const [first] = sale.order.lineItems;
  press('tender-split-chip');
  act(() => tender.picker!.onPick(first.id, 1));
  enter(500);
  press('tender-take');
  expect(sale.order.payments).toMatchObject([{ method: 'cash', amountMinor: 333, tenderedMinor: 500, changeMinor: 167 }]);
  expect(sale.order.balanceDueMinor).toBe(670);
  expect(text('tender-entry-amount')).toBe(money(670));
  press('tender-take');
  expect(sale.order.payments).toHaveLength(2);
  expect(sale.order.payments[1]).toMatchObject({ method: 'cash', amountMinor: 670 });
  const posOrder = await complete();
  expect(posOrder.totalMinor).toBe(1003);
  expect('cashRoundings' in posOrder).toBe(false);
  expect(posOrder.payments.map((leg) => leg.method)).toEqual(['cash', 'cash']);
});

// #1299 review: order-payload-shape.ts accepts 16 cashRoundings entries, so a 16th pick entry is refused (one stays for the settle).
it('PK9: 15 rounded cash picks are taken; the 16th that would add an entry is refused; the remainder settles with the 16th entry', async () => {
  const ids = startLines([...Array.from({ length: 16 }, () => 333), 335, 670]);
  for (const id of ids.slice(0, 15)) {
    const leg = cashPick(id, 500);
    expect(leg).toMatchObject({ method: 'cash', amountMinor: 335, changeMinor: 165 });
    expect(sale.order.cashRoundings?.at(-1)).toEqual({ paymentId: leg.id, minor: 2 });
  }
  expect(sale.order.cashRoundings).toHaveLength(15);
  const sixteenth = ids[15];
  pickLine(sixteenth);
  enter(500);
  expect(disabled('tender-take')).toBe(true);
  expect(text('tender-entry-hint')).toBe('Too many rounded cash payments on this sale: take the rest as one payment.');
  act(() => { expect(sale.addTender({ method: 'cash', amountMinor: 333, tenderedMinor: 500, units: { [sixteenth]: 1 }, rounding: five })).toBeNull(); });
  expect(sale.error).toBe(CASH_PICK_LIMIT);
  expect(sale.order.payments).toHaveLength(15);
  press('tender-split-chip'); // closing Split clears the pick
  // A pick that rounds exactly adds no entry, so it is still taken at the cap.
  const exact = cashPick(ids[16], 500);
  expect(exact).toMatchObject({ method: 'cash', amountMinor: 335, changeMinor: 165 });
  expect(sale.order.cashRoundings).toHaveLength(15);
  press('tender-take');
  const rest = lastLeg();
  expect(rest).toMatchObject({ method: 'cash', amountMinor: 1005 });
  expect(sale.order.cashRoundings?.at(-1)).toEqual({ paymentId: rest.id, minor: 2 });
  const posOrder = await complete();
  expect(posOrder.cashRoundings).toHaveLength(16);
  expect(posOrder.totalMinor).toBe(15 * 333 + 335 + 333 + 670 + 32);
  balances(posOrder, 6333);
});

it('PK10: the split heading after a typed cash pick shows the rest the Take leaves', () => {
  const [a] = startLines([333, 670]);
  pickLine(a);
  enter(500);
  expect(text('tender-split-heading')).toBe(`After this payment · ${money(670)}`);
  press('tender-take');
  expect(sale.order.balanceDueMinor).toBe(670);
});

it('PK11: while a card leg is pending a cash pick not payable in steps is refused; one payable in steps is taken unrounded', () => {
  const [a, b] = startLines([333, 335, 3000]);
  act(() => { expect(sale.addTender({ method: 'external', amountMinor: 1000, status: 'pending' })).toBeTypeOf('string'); });
  pickLine(a);
  enter(500);
  expect(text('tender-entry-hint')).toBe(CASH_WAITS_FOR_PAYMENT);
  expect(disabled('tender-take')).toBe(true);
  press('tender-take');
  expect(sale.order.payments).toHaveLength(1);
  act(() => { expect(sale.addTender({ method: 'cash', amountMinor: 333, tenderedMinor: 500, units: { [a]: 1 }, rounding: five })).toBeNull(); });
  expect(sale.error).toBe(CASH_WAITS_FOR_PAYMENT);
  expect(sale.order.payments).toHaveLength(1);
  press('tender-split-chip'); // closing Split clears the pick
  const leg = cashPick(b, 500);
  expect(leg).toMatchObject({ method: 'cash', amountMinor: 335, changeMinor: 165 });
  expect(sale.order.payments).toHaveLength(2);
  expect(sale.order.cashRoundings ?? []).toEqual([]);
});

// #1299 review (b3): order-payload-shape.ts accepts 16 cashRoundings entries; a cash leg that settles the sale may not add a 17th.
const SETTLE_LIMIT_COPY = 'Too many rounded cash payments on this sale: take the rest by another method.';
/** 15 lines of 333 and one of 1003 (5998), a card leg, 15 rounded picks (+2 each) and a cash settle of `settleMinor`: 16 entries; the card is then voided. */
function sixteenEntries(cardMinor: number, settleMinor: number, lastLineMinor = 1003, methods = rounding(five)) {
  const ids = startLines([...Array.from({ length: 15 }, () => 333), lastLineMinor], methods);
  let cardId = '';
  act(() => { cardId = sale.addTender({ method: 'external', amountMinor: cardMinor })!; });
  for (const id of ids.slice(0, 15)) cashPick(id, 500);
  expect(sale.order.cashRoundings).toHaveLength(15);
  act(() => { expect(sale.addTender({ method: 'cash', amountMinor: settleMinor, rounding: five })).toBeTypeOf('string'); });
  expect(sale.order.cashRoundings).toHaveLength(16);
  expect(sale.order.balanceDueMinor).toBe(0);
  act(() => { expect(sale.voidTender(cardId)).toBe(true); });
  expect(sale.order.cashRoundings).toHaveLength(16);
}

it('PK12: at 16 entries a cash settle that would add an entry is refused; card finishes the sale', () => {
  sixteenEntries(501, 500); // 5998 + 30 - 501 - 5025 = 502 due, rounded to 500 (-2)
  // 5998 + 30 - 2 = 6026 due; 15 * 335 + 500 paid: 501 left, the settle's -2 rounds it to 505 (a +4 entry).
  expect(sale.order.balanceDueMinor).toBe(501);
  press('tender-method-cash');
  expect(disabled('tender-take')).toBe(true);
  expect(text('tender-entry-hint')).toBe(SETTLE_LIMIT_COPY);
  act(() => { expect(sale.addTender({ method: 'cash', amountMinor: 505, rounding: five })).toBeNull(); });
  expect(sale.error).toBe(CASH_SETTLE_LIMIT);
  expect(sale.order.cashRoundings).toHaveLength(16);
  act(() => { expect(sale.addTender({ method: 'external', amountMinor: 501 })).toBeTypeOf('string'); });
  expect(sale.order.balanceDueMinor).toBe(0);
  expect(sale.order.cashRoundings).toHaveLength(16);
  expect(sale.order.cashRoundings!.length).toBeLessThanOrEqual(16);
});

it('PK13: at 16 entries, a cash settle that needs no entry is still taken', () => {
  sixteenEntries(500, 505); // 503 due, rounded to 505 (+2)
  // The settle took 505 against 503 (+2): 500 left, and 500 less the +2 rounds back to 500, so no entry.
  expect(sale.order.balanceDueMinor).toBe(500);
  act(() => { expect(sale.addTender({ method: 'cash', amountMinor: 500, rounding: five })).toBeTypeOf('string'); });
  expect(lastLeg()).toMatchObject({ method: 'cash', amountMinor: 500 });
  expect(sale.order.cashRoundings).toHaveLength(16);
  expect(sale.order.balanceDueMinor).toBe(0);
});

it('PK14: at 16 entries a zero-remainder write-off onto a leg with no entry is refused', () => {
  sixteenEntries(500, 505); // 503 due, rounded to 505 (+2)
  act(() => { expect(sale.addTender({ method: 'external', amountMinor: 497 })).toBeTypeOf('string'); });
  // 3 left less the +2 is 1, which rounds to 0: the write-off would put a new -3 entry on the card.
  expect(sale.order.balanceDueMinor).toBe(3);
  act(() => { expect(sale.addTender({ method: 'cash', amountMinor: 0, rounding: five })).toBeNull(); });
  expect(sale.error).toBe(CASH_SETTLE_LIMIT);
  press('tender-method-cash');
  expect(disabled('tender-take')).toBe(true);
  expect(text('tender-entry-hint')).toBe(SETTLE_LIMIT_COPY);
  act(() => { expect(sale.addTender({ method: 'external', amountMinor: 3 })).toBeTypeOf('string'); });
  expect(sale.order.balanceDueMinor).toBe(0);
  expect(sale.order.cashRoundings).toHaveLength(16);
});

it('PK15: at 16 entries a zero-remainder write-off onto a leg that already has an entry is still taken', () => {
  sixteenEntries(2, 1000, 1001); // 5996 + 30 - 2 - 5025 = 999 due, rounded to 1000 (+1)
  // 5996 + 31 - 6025 = 2 left; less the settle's +1 that is 1, which rounds to 0: the write-off merges onto the settle leg.
  expect(sale.order.balanceDueMinor).toBe(2);
  const settle = sale.order.cashRoundings!.at(-1)!.paymentId;
  press('tender-method-cash');
  expect(disabled('tender-take')).toBe(false);
  act(() => { expect(sale.addTender({ method: 'cash', amountMinor: 0, rounding: five })).toBe(settle); });
  expect(sale.error).toBeNull();
  expect(sale.order.cashRoundings).toHaveLength(16);
  expect(sale.order.cashRoundings!.at(-1)).toEqual({ paymentId: settle, minor: -1 });
  expect(sale.order.balanceDueMinor).toBe(0);
});

// A store whose only method is rounded cash has no other method to take the rest by: void the latest cash leg, or park.
const settleLimitVoidCopy = (minor: number) => `Too many rounded cash payments on this sale: void the ${money(minor)} cash payment, then take the rest again.`;
const settleLimitParkCopy = (minor: number) => `Too many rounded cash payments on this sale, and the ${money(minor)} cash payment cannot be voided here, so this sale can only be parked.`;
const cashOnly = [{ ...cash, defaults: { ...cash.defaults, rounding: five } }];
const cashOnlyNoVoid = [{ ...cash, capabilities: { ...cash.capabilities, void: false }, defaults: { ...cash.defaults, rounding: five } }];

it('PK16: at 16 entries on a cash-only store the hint says to void the latest cash payment, and that frees an entry', () => {
  sixteenEntries(501, 500, 1003, cashOnly);
  expect(sale.order.balanceDueMinor).toBe(501);
  press('tender-method-cash');
  expect(disabled('tender-take')).toBe(true);
  expect(text('tender-entry-hint')).toBe(settleLimitVoidCopy(500));
  const latest = sale.order.payments.filter((leg) => countsTowardPaid(leg) && leg.method === 'cash' && (sale.order.cashRoundings ?? []).some((e) => e.paymentId === leg.id)).at(-1)!;
  act(() => { expect(sale.voidTender(latest.id)).toBe(true); });
  expect(sale.order.cashRoundings).toHaveLength(15);
  expect(sale.order.balanceDueMinor).toBe(1003); // the voided settle's -2 entry drops out with it
  expect(disabled('tender-take')).toBe(false);
  act(() => { expect(sale.addTender({ method: 'cash', amountMinor: 1005, rounding: five })).toBeTypeOf('string'); });
  expect(sale.order.cashRoundings!.at(-1)!.minor).toBe(2);
  expect(sale.order.cashRoundings).toHaveLength(16);
  expect(sale.order.balanceDueMinor).toBe(0);
});

it('PK17: at 16 entries on a cash-only store whose cash cannot be voided the hint says the sale can only be parked', () => {
  sixteenEntries(501, 500, 1003, cashOnlyNoVoid);
  press('tender-method-cash');
  expect(disabled('tender-take')).toBe(true);
  expect(text('tender-entry-hint')).toBe(settleLimitParkCopy(500));
});

const cashAndTillCash = [...cashOnly, { ...cash, id: 'till-cash', capabilities: { ...cash.capabilities, void: false }, defaults: { ...cash.defaults, rounding: five } }];
it('PK18: at 16 entries on a cash-only store a later plain cash part payment is not the leg the hint means', () => {
  sixteenEntries(501, 500, 1003, cashAndTillCash);
  expect(sale.order.balanceDueMinor).toBe(501);
  let part = '';
  // The latest cash leg (the 200, till-cash) cannot be voided, so a hint that named it would say park.
  // The latest rounded leg (the 500 settle, cash) can be voided, so the hint says void.
  act(() => { part = sale.addTender({ method: 'cash', methodId: 'till-cash', amountMinor: 200, rounding: five })!; });
  expect(part).toBeTypeOf('string');
  expect(sale.order.cashRoundings).toHaveLength(16);
  expect(sale.order.balanceDueMinor).toBe(301);
  press('tender-method-cash');
  expect(disabled('tender-take')).toBe(true);
  expect(text('tender-entry-hint')).toBe(settleLimitVoidCopy(500));
  const settle = sale.order.cashRoundings!.at(-1)!.paymentId;
  act(() => { expect(sale.voidTender(settle)).toBe(true); });
  expect(sale.order.cashRoundings).toHaveLength(15);
  expect(sale.order.balanceDueMinor).toBe(803); // 301 + the voided 500 + its dropped -2 entry
  expect(countsTowardPaid(sale.order.payments.find((leg) => leg.id === part)!)).toBe(true);
  act(() => { expect(sale.addTender({ method: 'cash', amountMinor: 805, rounding: five })).toBeTypeOf('string'); });
  expect(sale.order.cashRoundings).toHaveLength(16);
  expect(sale.order.cashRoundings!.at(-1)!.minor).toBe(2);
  expect(sale.order.balanceDueMinor).toBe(0);
});
