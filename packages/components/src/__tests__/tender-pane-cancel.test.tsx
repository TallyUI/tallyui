// Row 514 (row 496 PR2, row 501 folded in): Back opens WCPOS v2's cancel-payment view when money was taken here; the cash
// to return per leg; and the gate-36c refused-leg button only on a leg the till can void (ADR-072 d3, amended 2026-11-22).
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { formatMoney, paymentMethodOf } from '@tallyui/core';
import { createOrderBuilder, orderDraftSchema, TaxProvider, taxProviderProps, tillLegsTheStoreRefuses, useSale, writeOrderDraft, type Order } from '@tallyui/pos';
import { Tender } from '../sale/tender';
import { cancelLegs, cashToReturnMinor } from '../sale/cancel-payment-view';
import { blue, click, pricing, SaleHarness, sale, traits } from './sale-harness';

const settings = { ...pricing, taxRatesPpm: { default: 0 } };
const taxContext = { getTaxRatePpm: () => 0, pricesIncludeTax: false };
const money = (amount: number) => formatMoney({ amount, currency: 'EUR' }) ?? '';
const text = (testID: string) => screen.getByTestId(testID).textContent;
const disabled = (testID: string) => screen.getByTestId(testID).getAttribute('aria-disabled') === 'true';
const cash = paymentMethodOf('cash');
const external = paymentMethodOf('external');
/** A card terminal the till cannot void: its legs are refund-only. */
const refundOnlyCard = { ...external, capabilities: { ...external.capabilities, void: false } };
const status = (id: string) => sale.order.payments.find((payment) => payment.id === id)?.status ?? 'captured';
let db: RxDatabase<{ pos_drafts: RxCollection }> | undefined;
afterEach(async () => { cleanup(); await db?.remove(); db = undefined; });

function start(priceMinor: number, method: 'cash' | 'external' = 'cash', methods?: Parameters<typeof Tender>[0]['methods']) {
  render(<SaleHarness settings={settings}>{(sale) => <Tender sale={sale} methods={methods} />}</SaleHarness>);
  act(() => sale.add(blue, traits));
  act(() => sale.setUnitPrice(sale.order.lineItems[0].id, priceMinor));
  act(() => sale.startTender(method));
}
/** tender.test.tsx's reopen(): one kept line at €10 and a locked leg the store already holds. */
function reopen(lockedMinor: number, methods?: Parameters<typeof Tender>[0]['methods']) {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext, storeOrder: { id: '41', revision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298' } });
  builder.addLine({ productId: 'coffee', name: 'Coffee', storeLineId: '7', unitPrice: { amount: 1000, currency: 'EUR' } });
  builder.addPayment({ method: 'external', amountMinor: lockedMinor, reference: 'Cash', storePaymentId: 'p1', locked: true });
  render(<SaleHarness settings={settings}>{(sale) => <Tender sale={sale} methods={methods} />}</SaleHarness>);
  act(() => { expect(sale.openStoreOrder(builder.getSnapshot())).toBeNull(); });
}
const back = () => click('Back');

describe('the cancel-payment view (row 514)', () => {
  it('C1 with no taken leg, Back goes straight to the cart', () => {
    start(2000);
    back();
    expect(screen.queryByTestId('tender-cancel-view')).toBeNull();
    expect(sale.stage.kind).toBe('cart');
  });

  it('C2 a taken cash leg: Back lists it as cash to return, still at tender, payments untouched', () => {
    start(2000);
    let id = '';
    act(() => { id = sale.addTender({ method: 'cash', amountMinor: 500 })!; });
    const before = sale.order.payments;
    back();
    expect(screen.getByTestId('tender-cancel-view')).toBeTruthy();
    expect(text(`tender-cancel-leg-${id}`)).toBe(`Return ${money(500)} cash to the customer`);
    expect(sale.stage.kind).toBe('tender');
    expect(sale.order.payments).toHaveLength(before.length);
    sale.order.payments.forEach((payment, index) => expect(payment).toBe(before[index]));
  });

  it('C3 Keep taking payment closes the view and changes nothing', () => {
    start(2000);
    act(() => { sale.addTender({ method: 'cash', amountMinor: 500 }); });
    const before = sale.order.payments;
    back();
    fireEvent.click(screen.getByTestId('tender-cancel-keep'));
    expect(screen.queryByTestId('tender-cancel-view')).toBeNull();
    expect(screen.getByTestId('tender-take')).toBeTruthy();
    expect(sale.stage.kind).toBe('tender');
    expect(sale.order.payments).toBe(before);
  });

  it('C4 Cancel and void returns to the cart with the leg kept as voided', () => {
    start(2000);
    let id = '';
    act(() => { id = sale.addTender({ method: 'cash', amountMinor: 500 })!; });
    back();
    fireEvent.click(screen.getByTestId('tender-cancel-confirm'));
    expect(sale.stage.kind).toBe('cart');
    expect(sale.order.payments).toMatchObject([{ id, method: 'cash', amountMinor: 500, status: 'voided' }]);
  });

  it('C5 a refund-only leg is listed as a refund, and Cancel and void leaves it captured', () => {
    start(2000, 'cash', [cash, refundOnlyCard]);
    let card = '', till = '';
    act(() => { card = sale.addTender({ method: 'external', amountMinor: 700 })!; });
    act(() => { till = sale.addTender({ method: 'cash', amountMinor: 500 })!; });
    back();
    expect(text(`tender-cancel-leg-${till}`)).toBe(`Return ${money(500)} cash to the customer`);
    expect(text(`tender-cancel-leg-${card}`)).toBe(`Refund ${money(700)} on Card terminal from the order`);
    fireEvent.click(screen.getByTestId('tender-cancel-confirm'));
    expect(sale.stage.kind).toBe('cart');
    expect(status(till)).toBe('voided');
    expect(status(card)).toBe('captured');
  }, 20_000);

  it('C5b with only a refund-only leg, the view offers Back, which keeps the leg', () => {
    start(2000, 'cash', [cash, refundOnlyCard]);
    let card = '';
    act(() => { card = sale.addTender({ method: 'external', amountMinor: 700 })!; });
    back();
    expect(screen.getByTestId('tender-cancel-view')).toBeTruthy();
    expect(screen.queryByTestId('tender-cancel-confirm')).toBeNull();
    fireEvent.click(screen.getByTestId('tender-cancel-back'));
    expect(sale.stage.kind).toBe('cart');
    expect(status(card)).toBe('captured');
  });

  it('C6 held legs are never listed: Back goes straight to the cart', () => {
    // tender-pane-held-legs.test.tsx's P2 fixture; the reopened leg keeps its takenAt, as reopen.ts copies it.
    const builder = createOrderBuilder({ currency: 'EUR', taxContext, storeOrder: { id: '41', revision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298' } });
    builder.addLine({ productId: 'coffee', name: 'Coffee', storeLineId: '7', unitPrice: { amount: 1000, currency: 'EUR' } });
    builder.addPayment({ method: 'external', amountMinor: 1000, reference: 'Cash', storePaymentId: 'p1', locked: true });
    builder.addPayment({ id: 'leg-reopened', method: 'cash', amountMinor: 500, reopened: true, takenAt: '2026-11-01T10:00:00.000Z' });
    render(<SaleHarness settings={settings}>{(sale) => <Tender sale={sale} />}</SaleHarness>);
    act(() => { expect(sale.openStoreOrder(builder.getSnapshot())).toBeNull(); });
    act(() => sale.startTender('cash'));
    expect(sale.order.payments.map((payment) => payment.id)).toContain('leg-reopened');
    back();
    expect(screen.queryByTestId('tender-cancel-view')).toBeNull();
    expect(sale.stage.kind).toBe('cart');
  });
});

describe('row 501: the cash to return, through the pane', () => {
  it('S1 a cash leg taken since #1214 returns its own amount after its change', () => {
    start(1500);
    let card = '', till = '';
    act(() => { card = sale.addTender({ method: 'external', amountMinor: 1000 })!; });
    act(() => { till = sale.addTender({ method: 'cash', amountMinor: 1000 })!; });
    expect(sale.order.payments.find((payment) => payment.id === till)).toMatchObject({ amountMinor: 500, tenderedMinor: 1000, changeMinor: 500 });
    act(() => { expect(sale.voidTender(card)).toBe(true); });
    back();
    expect(text(`tender-cancel-leg-${till}`)).toBe(`Return ${money(500)} cash to the customer`);
  });

  it('S2 a gross cash leg from a pre-#1214 draft returns the gross less its change', async () => {
    db = await createRxDatabase({ name: `cancelview${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    await db.addCollections({ pos_drafts: { schema: orderDraftSchema } });
    const builder = createOrderBuilder({ currency: 'EUR', taxContext });
    builder.addLine({ productId: 'coffee', name: 'Coffee', unitPrice: { amount: 1500, currency: 'EUR' } });
    builder.addPayment({ id: 'gross', method: 'cash', amountMinor: 2000, takenAt: '2026-11-01T10:00:00.000Z' });
    await writeOrderDraft(db.pos_drafts, builder.getSnapshot());
    let held!: ReturnType<typeof useSale>;
    function Held({ drafts }: { drafts: RxCollection }) {
      held = useSale(settings, { registerId: 'register-1', cashierRef: 'cashier', drafts });
      return <Tender sale={held} />;
    }
    render(<TaxProvider {...taxProviderProps(settings)}><Held drafts={db.pos_drafts} /></TaxProvider>);
    await act(async () => { expect(await held.resume(builder.getSnapshot().id)).toBeNull(); });
    act(() => held.startTender('cash'));
    expect(held.order.changeDueMinor).toBe(500);
    back();
    expect(text('tender-cancel-leg-gross')).toBe(`Return ${money(1500)} cash to the customer`);
  }, 20_000);
});

describe('row 501: cashToReturnMinor', () => {
  const at = '2026-11-22T10:00:00.000Z';
  const order = (payments: Order['payments'], changeDueMinor: number, totalMinor = 1500) => ({ payments, changeDueMinor, totalMinor });
  const returned = (o: ReturnType<typeof order>, id: string) => cashToReturnMinor(o, o.payments.find((payment) => payment.id === id)!);

  it('H1 S1 as stored: the net leg returns its amount', () => {
    const o = order([{ id: 'card', method: 'external', amountMinor: 1000, status: 'voided', takenAt: at },
      { id: 'c', method: 'cash', amountMinor: 500, tenderedMinor: 1000, changeMinor: 500, takenAt: at }], 0);
    expect(returned(o, 'c')).toBe(500);
  });

  it('H2 a single cash overpayment', () => {
    const o = order([{ id: 'c', method: 'cash', amountMinor: 1500, tenderedMinor: 2000, changeMinor: 500, takenAt: at }], 0);
    expect(returned(o, 'c')).toBe(1500);
  });

  it('H3 two net cash legs', () => {
    const o = order([{ id: 'c1', method: 'cash', amountMinor: 1000, tenderedMinor: 1000, changeMinor: 0, takenAt: at },
      { id: 'c2', method: 'cash', amountMinor: 500, tenderedMinor: 1000, changeMinor: 500, takenAt: at }], 0);
    expect(returned(o, 'c1')).toBe(1000);
    expect(returned(o, 'c2')).toBe(500);
  });

  it('H4 the store refund due is not till change', () => {
    const o = order([{ id: 'lock', method: 'external', amountMinor: 1200, storePaymentId: 'p1', locked: true },
      { id: 'c1', method: 'cash', amountMinor: 300, takenAt: at }], 500, 1000);
    expect(returned(o, 'c1')).toBe(0);
  });

  it('H5 a gross leg from an old draft is netted', () => {
    const o = order([{ id: 'c', method: 'cash', amountMinor: 2000, takenAt: at }], 500);
    expect(returned(o, 'c')).toBe(1500);
  });

  it('H6 mixed: a net leg is never netted (gross leg walked first)', () => {
    const o = order([{ id: 'c1', method: 'cash', amountMinor: 1000, tenderedMinor: 1000, changeMinor: 0, takenAt: at },
      { id: 'gross', method: 'cash', amountMinor: 2000 }], 1500);
    expect(returned(o, 'c1')).toBe(1000);
  });

  it('H6b mixed, net leg last: a net leg is never netted (1add96ac gives 0)', () => {
    const o = order([{ id: 'gross', method: 'cash', amountMinor: 2000 },
      { id: 'c1', method: 'cash', amountMinor: 1000, tenderedMinor: 1000, changeMinor: 0, takenAt: at }], 1500);
    expect(returned(o, 'c1')).toBe(1000);
  });

  it('H7 for H6, the unstamped setTender leg is not a cancel leg', () => {
    const payments: Order['payments'] = [{ id: 'c1', method: 'cash', amountMinor: 1000, tenderedMinor: 1000, changeMinor: 0, takenAt: at },
      { id: 'gross', method: 'cash', amountMinor: 2000 }];
    expect(cancelLegs({ payments } as Order).map((payment) => payment.id)).toEqual(['c1']);
  });
});

describe('the refused-leg button (gate 36c; desk pin: never a dead button)', () => {
  function refusedLeg(methods?: Parameters<typeof Tender>[0]['methods']) {
    reopen(1000, methods);
    act(() => { expect(sale.setUnitPrice(sale.order.lineItems[0].id, 800)).toBeNull(); });
    act(() => sale.startTender('cash'));
    act(() => sale.setTender({ method: 'cash', amountMinor: 500 }));
    return sale.order.payments.find((payment) => !payment.locked && !payment.reopened)!.id;
  }

  it('R1 a leg the till cannot void gets a refund line and the park-only copy, no button', () => {
    const id = refusedLeg([{ ...cash, capabilities: { ...cash.capabilities, void: false } }, external]);
    expect(screen.queryByTestId(`tender-leg-${id}-refused-void`)).toBeNull();
    expect(text(`tender-leg-${id}-refused-refund`)).toBe(`Refund ${money(500)} on Cash from the order`);
    expect(text('tender-store-holds')).toBe(`The store already holds this sale's payment. The ${money(500)} taken here can only be refunded from the order, so this sale can only be parked.`);
    expect(disabled('tender-complete')).toBe(true);
  });

  it('R2 a leg the till can void: its button voids it and Complete opens', () => {
    const id = refusedLeg();
    fireEvent.click(screen.getByTestId(`tender-leg-${id}-refused-void`));
    expect(status(id)).toBe('voided');
    expect(screen.queryByTestId(`tender-leg-${id}-refused-void`)).toBeNull();
    expect(tillLegsTheStoreRefuses(sale.order)).not.toContain(id);
    expect(screen.queryByTestId('tender-store-holds')).toBeNull();
    expect(disabled('tender-complete')).toBe(false);
  });
});
