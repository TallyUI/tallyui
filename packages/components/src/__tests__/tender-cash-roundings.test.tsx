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
  buildReceiptData, countsTowardPaid, createOrderBuilder, displayCart, legStatus, NOTHING_TO_ROUND_AGAINST, VOID_LATER_CASH_FIRST, orderDraftSchema, posOrderCollection, reopenRefusedOrder,
  restoreOrderDraft, takingsByMethod, TaxProvider, taxProviderProps, toOrderCreateEnvelope, useSale, writeOrderDraft, type Order, type PosOrder,
} from '@tallyui/pos';
import { CustomerDisplayScreen } from '../sale/customer-display-screen';
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

it('R7c: with a leg in motion the cash Take is not rounded: BASE\'s net leg, and no entry when the pending leg fails', () => {
  start(2, rounding(nearest), carries);
  enter(1000);
  press('tender-take');
  expect(sale.order.payments).toMatchObject([{ method: 'cash', amountMinor: 1000, tenderedMinor: 1000, changeMinor: 0 }]);
  let cardId: string | null = null;
  act(() => { cardId = sale.addTender({ method: 'external', amountMinor: 2123, status: 'pending' }); });
  enter(2130);
  // By hand, tenderRounding(entry 2130 dirty, balance 3125 - 1000 = 2125, null): rounded due 2125, rounding 0,
  // applied min(2130, 2125) = 2125, so no "Rounded from" and Take reads 21.25. entryChange =
  // 2130 - min(2125, max(0, 2125 - 2123) + 0) = 2130 - 2 = 2128, the change the leg records; tillChange is 0 before Take.
  expect(screen.getByTestId('tender-figure').textContent).not.toContain('Rounded from');
  expect(text('tender-take')).toBe(`Take ${money(2125)} in Cash`);
  expect(text('tender-entry-hint')).toBe(`Change ${money(2128)}`);
  expect(screen.queryByTestId('tender-change')).toBeNull();
  press('tender-take');
  // By hand, use-sale.ts's non-rule path: due = 3125 - 1000 - 2123 (in motion) = 2, so the leg is min(2130, 2) = 2,
  // tendered 2130, change 2130 - 2 = 2128.
  expect(sale.order.payments).toHaveLength(3);
  expect(sale.order.payments[2]).toMatchObject({ method: 'cash', amountMinor: 2, tenderedMinor: 2130, changeMinor: 2128 });
  expect(text('tender-change')).toBe(`Change ${money(2128)}`);
  expect(sale.order).not.toHaveProperty('cashRoundings');
  act(() => { expect(sale.setTenderStatus(cardId!, 'failed')).toBe(true); });
  expect(sale.order).not.toHaveProperty('cashRoundings');
  expect(sale.order.totalMinor).toBe(3125);
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

it('property (desk): live entries never reach a full increment, and latest-first always unwinds', () => {
  for (let seed = 1; seed <= 120; seed++) {
    const random = mulberry32(seed);
    const rule: PaymentRounding = { incrementMinor: 5, mode: (['nearest', 'up', 'down'] as const)[Math.floor(random() * 3)] };
    const price = 1000 + Math.floor(random() * 1000);
    const steps: string[] = [`${rule.mode}, price ${price}`];
    startCustom(price, rounding(rule), carries);
    for (let step = 0; step < 8; step++) {
      const choice = Math.floor(random() * 5);
      const due = sale.order.balanceDueMinor;
      const live = sale.order.payments.filter(countsTowardPaid);
      if (choice === 4 && live.length) {
        const leg = live[Math.floor(random() * live.length)];
        steps.push(`void payment ${sale.order.payments.indexOf(leg)}`);
        act(() => { sale.voidTender(leg.id); });
      } else if (choice < 4 && due > 0 && (choice !== 0 || due > 1)) {
        const amountMinor = choice === 0 ? 1 + Math.floor(random() * (due - 1))
          : choice === 1 ? due + 10 : choice === 2 ? 0 : 1 + Math.floor(random() * due);
        const method = choice === 3 ? 'external' : 'cash';
        steps.push(`${method} ${amountMinor} (due ${due})`);
        act(() => { sale.addTender({ method, amountMinor, ...(method === 'cash' ? { rounding: rule } : {}) }); });
      } else steps.push(`skip ${choice} (due ${due})`);
      expect(Math.abs((sale.order.cashRoundings ?? []).reduce((sum, entry) => sum + entry.minor, 0)), `seed ${seed}: ${steps.join('; ')}`).toBeLessThan(5);
    }
    for (const leg of sale.order.payments.filter(countsTowardPaid).reverse()) {
      act(() => { expect(sale.voidTender(leg.id), `seed ${seed}: ${steps.join('; ')}`).toBe(true); });
    }
    cleanup();
  }
}, 60_000);

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
