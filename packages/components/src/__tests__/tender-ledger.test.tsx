import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { formatMoney, paymentMethodOf, type PaymentMethodDescriptor } from '@tallyui/core';
import { canVoidLeg, createOrderBuilder, NOTHING_DUE, orderDraftSchema, TaxProvider, taxProviderProps, useSale, writeOrderDraft, type Order, type Payment } from '@tallyui/pos';
import { PortalHost } from '@tallyui/primitives';
import { Cart } from '../sale/cart';
import { Tender } from '../sale/tender';
import { blue, pricing, SaleHarness, sale, traits } from './sale-harness';

afterEach(() => cleanup());

const settings = { ...pricing, taxRatesPpm: { default: 0 } };
const money = (amount: number) => formatMoney({ amount, currency: 'EUR' }) ?? '';
const text = (testID: string) => screen.getByTestId(testID).textContent;
const leg = (index: number) => sale.order.payments[index].id;
function start(priceMinor: number, methods?: PaymentMethodDescriptor[]) {
  render(<SaleHarness settings={settings}>{(sale) => <><Tender sale={sale} ledger={false} methods={methods} /><Cart sale={sale} showTotal={false} tenderLedger={{ methods }} /></>}</SaleHarness>);
  act(() => sale.add(blue, traits));
  act(() => sale.setUnitPrice(sale.order.lineItems[0].id, priceMinor));
  act(() => sale.startTender('cash'));
}

describe('Cart tenderLedger', () => {
  it('puts the empty ledger in the cart under Payments, and none in the pane', () => {
    start(5000);
    expect(screen.getAllByTestId('tender-ledger')).toHaveLength(1);
    expect(within(screen.getByTestId('tender-pane')).queryByTestId('tender-ledger')).toBeNull();
    expect(within(screen.getByTestId('cart-payments')).getByText('Payments')).toBeTruthy();
    expect(text('tender-ledger')).toBe('No payments yet');
    expect(text('tender-ledger-totals')).toBe(`Total${money(5000)}Paid${money(0)}Remaining${money(5000)}`);
    expect(screen.queryByRole('button', { name: /^Checkout/ })).toBeNull();
    expect(within(screen.getByTestId('cart-footer')).queryByRole('button', { name: 'Cash' })).toBeNull();
  });

  it('lists two taken legs in the cart; Cancel payment there voids a leg and Remaining rises', () => {
    start(5000);
    act(() => { sale.addTender({ method: 'cash', amountMinor: 1000 }); });
    act(() => { sale.addTender({ method: 'external', amountMinor: 1500 }); });
    const payments = within(screen.getByTestId('cart-payments'));
    expect(payments.getByTestId(`tender-leg-${leg(0)}`)).toBeTruthy();
    expect(payments.getByTestId(`tender-leg-${leg(1)}`)).toBeTruthy();
    expect(text('tender-ledger-remaining')).toBe(money(2500));
    fireEvent.click(screen.getByTestId(`tender-leg-${leg(1)}-void`));
    expect(text(`tender-leg-${leg(1)}-status`)).toBe('Cancelled');
    expect(text('tender-ledger-remaining')).toBe(money(4000));
  });

  it('reads Paid in full as the lead row once nothing is due', () => {
    start(2000);
    act(() => { sale.addTender({ method: 'cash', amountMinor: 2000 }); });
    expect(text('tender-ledger-lead')).toMatch(/^Paid in full · /);
    expect(screen.queryByTestId('tender-ledger-remaining')).toBeNull();
    expect(screen.getAllByText(/^Paid in full/)).toHaveLength(1);
  });

  it("titles each leg by its own method id's descriptor, else the id itself", () => {
    const own = (id: string, title: string, kind: string): PaymentMethodDescriptor =>
      ({ ...paymentMethodOf(kind === 'cash' ? 'cash' : 'external'), id, title, kind });
    start(5000, [own('pos_cash', 'Till cash', 'cash'), own('cheque', 'Cheque', 'other')]);
    act(() => { sale.addTender({ method: 'cash', methodId: 'pos_cash', amountMinor: 1000 }); });
    act(() => { sale.addTender({ method: 'external', methodId: 'cheque', amountMinor: 1500 }); });
    act(() => { sale.addTender({ method: 'external', methodId: 'gift_voucher', amountMinor: 500 }); });
    const title = (index: number) => text(`tender-leg-${leg(index)}`)?.split(money(sale.order.payments[index].amountMinor))[0];
    expect([0, 1, 2].map(title)).toEqual(['Till cash', 'Cheque', 'gift_voucher']);
    expect(screen.getByTestId(`tender-leg-${leg(1)}-void`)).toBeTruthy();
    expect(screen.queryByTestId(`tender-leg-${leg(2)}-void`)).toBeNull();
  });

  it("never reads an external leg with methodId 'cash' as the default Cash: titled by its id, with no Cancel payment", () => {
    start(5000);
    act(() => { sale.addTender({ method: 'external', methodId: 'cash', amountMinor: 1000 }); });
    expect(text(`tender-leg-${leg(0)}`)?.split(money(1000))[0]).toBe('cash');
    expect(screen.queryByTestId(`tender-leg-${leg(0)}-void`)).toBeNull();
  });
});

describe('TenderLedger confirmVoid', () => {
  function asking(priceMinor: number) {
    render(<><SaleHarness settings={settings}>{(sale) => <><Tender sale={sale} ledger={false} /><Cart sale={sale} showTotal={false} tenderLedger={{ confirmVoid: true }} /></>}</SaleHarness><PortalHost /></>);
    act(() => sale.add(blue, traits));
    act(() => sale.setUnitPrice(sale.order.lineItems[0].id, priceMinor));
    act(() => sale.startTender('cash'));
    act(() => { sale.addTender({ method: 'cash', amountMinor: 1000 }); });
    act(() => { sale.addTender({ method: 'external', amountMinor: 1500 }); });
  }
  const question = () => within(screen.getByTestId('tender-leg-void-dialog'));

  it('with confirmVoid, Cancel payment asks first: the leg stays until confirm, then reads Cancelled and Remaining rises', () => {
    asking(5000);
    const status = text(`tender-leg-${leg(1)}-status`);
    expect(screen.queryByTestId('tender-leg-void-dialog')).toBeNull();
    fireEvent.click(screen.getByTestId(`tender-leg-${leg(1)}-void`));
    expect(question().getByText('Cancel this payment?')).toBeTruthy();
    expect(text(`tender-leg-${leg(1)}-status`)).toBe(status);
    expect(text('tender-ledger-remaining')).toBe(money(2500));
    fireEvent.click(screen.getByTestId('tender-leg-void-dialog-confirm'));
    expect(text(`tender-leg-${leg(1)}-status`)).toBe('Cancelled');
    expect(text('tender-ledger-remaining')).toBe(money(4000));
    expect(text(`tender-leg-${leg(0)}-status`)).toBe(status);
    expect(screen.queryByTestId('tender-leg-void-dialog')).toBeNull();
  });

  it('Cancel in the question keeps the leg and Remaining', () => {
    asking(5000);
    const status = text(`tender-leg-${leg(0)}-status`);
    fireEvent.click(screen.getByTestId(`tender-leg-${leg(0)}-void`));
    expect(question().getByText('Cancel this payment?')).toBeTruthy();
    fireEvent.click(screen.getByTestId('tender-leg-void-dialog-cancel'));
    expect(screen.queryByTestId('tender-leg-void-dialog')).toBeNull();
    expect(text(`tender-leg-${leg(0)}-status`)).toBe(status);
    expect(text('tender-ledger-remaining')).toBe(money(2500));
    expect(sale.order.paidMinor).toBe(2500);
  });

  it('a cash leg\'s question reads "Return €10.00 cash to the customer"', () => {
    asking(5000);
    fireEvent.click(screen.getByTestId(`tender-leg-${leg(0)}-void`));
    expect(question().getByText(`Return ${money(1000)} cash to the customer`)).toBeTruthy();
    expect(money(1000)).toBe('€10.00');
  });

  it('an external leg\'s question reads "Void €15.00 on Card terminal"', () => {
    asking(5000);
    fireEvent.click(screen.getByTestId(`tender-leg-${leg(1)}-void`));
    expect(question().getByText(`Void ${money(1500)} on Card terminal`)).toBeTruthy();
    expect(money(1500)).toBe('€15.00');
  });
});

describe('TenderLedger held legs (desk 2026-11-21)', () => {
  let db: RxDatabase<{ pos_drafts: RxCollection }> | undefined;
  afterEach(async () => { cleanup(); await db?.remove(); db = undefined; });
  const taxContext = { getTaxRatePpm: () => 0, pricesIncludeTax: false };
  /** A €50 sale paid by one captured leg, written as a draft, resumed and tendered: how a reopened or after-close sale reaches the till. */
  async function resumed(leg: { method: 'cash' | 'external'; reopened?: true }, afterClose = false) {
    db = await createRxDatabase({ name: `heldlegs${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    await db.addCollections({ pos_drafts: { schema: orderDraftSchema } });
    const builder = createOrderBuilder({ currency: 'EUR', taxContext, ...(afterClose ? { afterClose: { sessionId: 'closed-session',
      createdAt: '2026-11-20T09:00:00.000Z', registerId: 'register-0', payments: [{ id: 'leg-1', method: leg.method, amountMinor: 5000 }],
      taxMinor: 0, fees: [], shipping: [] } } : {}) });
    builder.addLine({ productId: 'coffee', name: 'Coffee', unitPrice: { amount: 5000, currency: 'EUR' } });
    builder.addPayment({ id: 'leg-1', ...leg, amountMinor: 5000 });
    await writeOrderDraft(db.pos_drafts, builder.getSnapshot());
    let held!: ReturnType<typeof useSale>;
    function Held({ drafts }: { drafts: RxCollection }) {
      held = useSale(settings, { registerId: 'register-1', cashierRef: 'cashier', drafts });
      return <Tender sale={held} />;
    }
    render(<TaxProvider {...taxProviderProps(settings)}><Held drafts={db.pos_drafts} /></TaxProvider>);
    await act(async () => { expect(await held.resume(builder.getSnapshot().id)).toBeNull(); });
    act(() => held.startTender('cash'));
    return held;
  }
  /** use-sale-locked-legs.test.tsx's reopenedBuilder (tender.test.tsx's reopen): a store order whose €50 leg the store holds. */
  function locked() {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext, storeOrder: { id: '41', revision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298' } });
    builder.addLine({ productId: 'coffee', name: 'Coffee', storeLineId: '7', unitPrice: { amount: 5000, currency: 'EUR' } });
    builder.addPayment({ id: 'leg-1', method: 'external', amountMinor: 5000, reference: 'Cash', storePaymentId: 'p1', locked: true });
    render(<SaleHarness settings={settings}>{(sale) => <Tender sale={sale} />}</SaleHarness>);
    act(() => { expect(sale.openStoreOrder(builder.getSnapshot())).toBeNull(); });
    act(() => sale.startTender('cash'));
    return sale;
  }
  /** The leg is one Cancel payment would void (manual, void-capable, captured): only the held-leg guard hides it. */
  function expectVoidable(held: { order: Order }) {
    const [only] = held.order.payments;
    expect(only.id).toBe('leg-1');
    expect(canVoidLeg(only, paymentMethodOf(only.method === 'cash' ? 'cash' : 'external'))).toBe(true);
  }

  it.each(['cash', 'external'] as const)('L1 a live captured %s leg has Cancel payment', (method) => {
    start(5000);
    act(() => { sale.addTender({ method, amountMinor: 1000 }); });
    expect(canVoidLeg(sale.order.payments[0], paymentMethodOf(method))).toBe(true);
    expect(screen.getByTestId(`tender-leg-${leg(0)}-void`)).toBeTruthy();
  });

  it('L1 a reopened leg has no Cancel payment', async () => {
    const held = await resumed({ method: 'cash', reopened: true });
    expect(held.order.payments[0].reopened).toBe(true);
    expectVoidable(held);
    expect(screen.getByTestId('tender-leg-leg-1')).toBeTruthy();
    expect(screen.queryByTestId('tender-leg-leg-1-void')).toBeNull();
  });

  it('L1 a locked leg has no Cancel payment', () => {
    const held = locked();
    expect(held.order.payments[0].locked).toBe(true);
    expectVoidable(held);
    expect(screen.getByTestId('tender-leg-leg-1')).toBeTruthy();
    expect(screen.queryByTestId('tender-leg-leg-1-void')).toBeNull();
  });

  it("L1 a leg in the after-close closure's payments has no Cancel payment", async () => {
    const held = await resumed({ method: 'cash' }, true);
    expect(held.order.afterClose?.payments.map((payment) => payment.id)).toEqual(['leg-1']);
    expect(held.order.payments[0].reopened).toBeUndefined();
    expectVoidable(held);
    expect(screen.getByTestId('tender-leg-leg-1')).toBeTruthy();
    expect(screen.queryByTestId('tender-leg-leg-1-void')).toBeNull();
  });
});

describe('TenderLedger leg times', () => {
  let db: RxDatabase<{ pos_drafts: RxCollection }> | undefined;
  afterEach(async () => { vi.useRealTimers(); cleanup(); await db?.remove(); db = undefined; });
  /** The device's short time, written out as the ledger must render it. */
  const clock = (t: string | undefined) => new Date(t!).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  /**
   * A sale (€50 unless `priceMinor` says otherwise) resumed from a draft. Its legs are reopened unless `reopened` is
   * false, so startTender keeps them; a leg without `takenAt` is one from before the field. A captured or voided leg
   * with `takenAt` is kept through startTender without `reopened` (takenLeg is part of heldLeg).
   */
  async function restored(
    payments: { method: 'cash' | 'external'; amountMinor: number; status?: 'pending' | 'captured' | 'voided'; takenAt?: string }[],
    { priceMinor = 5000, reopened = true }: { priceMinor?: number; reopened?: boolean } = {},
  ) {
    db = await createRxDatabase({ name: `legtimes${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    await db.addCollections({ pos_drafts: { schema: orderDraftSchema } });
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
    builder.addLine({ productId: 'coffee', name: 'Coffee', unitPrice: { amount: priceMinor, currency: 'EUR' } });
    payments.forEach((payment, index) => builder.addPayment({ id: `leg-${index + 1}`, ...payment, ...(reopened ? { reopened: true } : {}) }));
    await writeOrderDraft(db.pos_drafts, builder.getSnapshot());
    let held!: ReturnType<typeof useSale>;
    function Held({ drafts }: { drafts: RxCollection }) {
      held = useSale(settings, { registerId: 'register-1', cashierRef: 'cashier', drafts });
      return <><Tender sale={held} ledger={false} /><Cart sale={held} showTotal={false} tenderLedger={{}} /></>;
    }
    render(<TaxProvider {...taxProviderProps(settings)}><Held drafts={db.pos_drafts} /></TaxProvider>);
    await act(async () => { expect(await held.resume(builder.getSnapshot().id)).toBeNull(); });
    act(() => held.startTender('cash'));
    return held;
  }

  it('P1 a leg with takenAt shows the time it was taken', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 21, 9, 42));
    start(5000);
    act(() => { sale.addTender({ method: 'cash', amountMinor: 1000 }); });
    const { takenAt } = sale.order.payments[0];
    expect(takenAt).toBeDefined();
    expect(takenAt).toBe(new Date(2026, 10, 21, 9, 42).toISOString());
    expect(text(`tender-leg-${leg(0)}-time`)).toBe(clock(takenAt));
  });

  it('P6 Paid in full names the settled leg\'s time when a later leg in order.payments does not count', async () => {
    const held = await restored([
      { method: 'cash', amountMinor: 2000, status: 'captured', takenAt: new Date(2026, 10, 21, 10, 0).toISOString() },
      { method: 'cash', amountMinor: 500, status: 'voided', takenAt: new Date(2026, 10, 21, 10, 7).toISOString() },
    ], { priceMinor: 2000, reopened: false });
    const [settled, voided] = held.order.payments;
    expect(voided).toMatchObject({ id: 'leg-2', status: 'voided' });
    expect(voided.takenAt).toBe(new Date(2026, 10, 21, 10, 7).toISOString());
    expect(clock(settled.takenAt)).not.toBe(clock(voided.takenAt));
    expect(held.order.balanceDueMinor).toBe(0);
    expect(text('tender-ledger-lead')).toBe(`Paid in full · ${clock(settled.takenAt)}`);
    // a cash leg cannot be added once nothing is due (row 500), so the later voided leg comes from a draft.
    act(() => { expect(held.addTender({ method: 'cash', amountMinor: 500 })).toBeNull(); });
    // `held` is the render-time sale, so its `error` is read where the live sale shows it.
    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toContain(NOTHING_DUE);
  });

  it('P2 a pending leg without takenAt shows no time', async () => {
    const held = await restored([{ method: 'external', amountMinor: 1000, status: 'pending' }]);
    expect(held.order.payments[0]).toMatchObject({ id: 'leg-1', status: 'pending' });
    expect(held.order.payments[0].takenAt).toBeUndefined();
    expect(screen.getByTestId('tender-leg-leg-1')).toBeTruthy();
    expect(screen.queryByTestId('tender-leg-leg-1-time')).toBeNull();
  });

  it("P3 Paid in full names the last settled leg's time, not the first's", () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    start(2000);
    vi.setSystemTime(new Date(2026, 10, 21, 10, 0));
    act(() => { sale.addTender({ method: 'cash', amountMinor: 1000 }); });
    vi.setSystemTime(new Date(2026, 10, 21, 10, 7));
    act(() => { sale.addTender({ method: 'external', amountMinor: 1000 }); });
    const [first, last] = sale.order.payments.map((payment) => clock(payment.takenAt));
    expect(first).not.toBe(last);
    expect(last).toBe(clock(new Date(2026, 10, 21, 10, 7).toISOString()));
    expect(text('tender-ledger-lead')).toBe(`Paid in full · ${last}`);
  });

  it('P4 a fully paid sale whose settled legs have no takenAt reads plain Paid in full', async () => {
    const held = await restored([{ method: 'cash', amountMinor: 3000 }, { method: 'external', amountMinor: 2000 }]);
    expect(held.order.balanceDueMinor).toBe(0);
    expect(held.order.payments.map((payment) => payment.takenAt)).toEqual([undefined, undefined]);
    expect(text('tender-ledger-lead')).toBe('Paid in full');
    expect(screen.queryByTestId('tender-leg-leg-1-time')).toBeNull();
  });

  it("P5 the pane's own ledger reads Paid in full with the time", () => {
    render(<SaleHarness settings={settings}>{(sale) => <Tender sale={sale} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    act(() => sale.setUnitPrice(sale.order.lineItems[0].id, 2000));
    act(() => sale.startTender('cash'));
    act(() => { sale.addTender({ method: 'cash', amountMinor: 2000 }); });
    const pane = within(screen.getByTestId('tender-pane'));
    expect(pane.getByTestId('tender-ledger')).toBeTruthy();
    expect(pane.getByText(`Paid in full · ${clock(sale.order.payments[0].takenAt)}`)).toBeTruthy();
  });
});

describe('TenderLedger beforeVoid (#1260)', () => {
  type Hook = (leg: Payment) => boolean | void | Promise<boolean | void>;
  /** The pane's own ledger, through Tender → TenderPane → TenderLedger; one €10 cash leg and one €15 external leg on €50. */
  function guarded(beforeVoid: Hook, confirmVoid = false, afterVoid?: (leg: Payment, voided: boolean) => void) {
    render(<><SaleHarness settings={settings}>{(sale) => <Tender sale={sale} beforeVoid={beforeVoid} confirmVoid={confirmVoid} afterVoid={afterVoid} />}</SaleHarness><PortalHost /></>);
    act(() => sale.add(blue, traits));
    act(() => sale.setUnitPrice(sale.order.lineItems[0].id, 5000));
    act(() => sale.startTender('cash'));
    act(() => { sale.addTender({ method: 'cash', amountMinor: 1000 }); });
    act(() => { sale.addTender({ method: 'external', amountMinor: 1500 }); });
  }
  /** A hook whose promise the test settles. */
  function later() {
    let settle!: (value: boolean | void) => void;
    const hook = vi.fn<Hook>(() => new Promise<boolean | void>((resolve) => { settle = resolve; }));
    return { hook, settle: async (value: boolean | void) => { await act(async () => { settle(value); }); } };
  }
  const status = (index: number) => text(`tender-leg-${leg(index)}-status`);

  it('beforeVoid runs before the void, and the void waits for it (#1260)', async () => {
    const { hook, settle } = later();
    guarded(hook);
    const before = status(1);
    const target = sale.order.payments[1];
    await act(async () => { fireEvent.click(screen.getByTestId(`tender-leg-${leg(1)}-void`)); });
    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook.mock.calls[0][0]).toMatchObject({ id: target.id, amountMinor: 1500 });
    expect(status(1)).toBe(before);
    expect(sale.order.paidMinor).toBe(2500);
    await settle(undefined);
    expect(status(1)).toBe('Cancelled');
    expect(sale.order.paidMinor).toBe(1000);
  });

  it('beforeVoid returning false keeps the leg', async () => {
    const hook = vi.fn<Hook>(async () => false);
    guarded(hook);
    const before = status(0);
    await act(async () => { fireEvent.click(screen.getByTestId(`tender-leg-${leg(0)}-void`)); });
    expect(hook).toHaveBeenCalledTimes(1);
    expect(status(0)).toBe(before);
    expect(sale.order.paidMinor).toBe(2500);
  });

  it('a throwing beforeVoid keeps the leg', async () => {
    const hook = vi.fn<Hook>(() => { throw new Error('journal down'); });
    guarded(hook);
    const before = status(0);
    await act(async () => { fireEvent.click(screen.getByTestId(`tender-leg-${leg(0)}-void`)); });
    expect(hook).toHaveBeenCalledTimes(1);
    expect(status(0)).toBe(before);
    expect(sale.order.paidMinor).toBe(2500);
  });

  it('with confirmVoid the hook runs after Confirm, not on the first press', async () => {
    const hook = vi.fn<Hook>(async () => undefined);
    guarded(hook, true);
    await act(async () => { fireEvent.click(screen.getByTestId(`tender-leg-${leg(1)}-void`)); });
    expect(screen.getByTestId('tender-leg-void-dialog')).toBeTruthy();
    expect(hook).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByTestId('tender-leg-void-dialog-confirm')); });
    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook.mock.calls[0][0].id).toBe(leg(1));
    expect(status(1)).toBe('Cancelled');
  });

  it('Cancel payment is disabled while the hook is in flight', async () => {
    const { hook, settle } = later();
    guarded(hook);
    const button = () => screen.getByTestId(`tender-leg-${leg(1)}-void`);
    await act(async () => { fireEvent.click(button()); });
    expect(button().getAttribute('aria-disabled')).toBe('true');
    await act(async () => { fireEvent.click(button()); });
    expect(hook).toHaveBeenCalledTimes(1);
    await settle(undefined);
    expect(status(1)).toBe('Cancelled');
  });

  it("Cart's tenderLedger passes beforeVoid through", async () => {
    const { hook, settle } = later();
    render(<SaleHarness settings={settings}>{(sale) => <><Tender sale={sale} ledger={false} /><Cart sale={sale} showTotal={false} tenderLedger={{ beforeVoid: hook }} /></>}</SaleHarness>);
    act(() => sale.add(blue, traits));
    act(() => sale.setUnitPrice(sale.order.lineItems[0].id, 5000));
    act(() => sale.startTender('cash'));
    act(() => { sale.addTender({ method: 'external', amountMinor: 1500 }); });
    await act(async () => { fireEvent.click(within(screen.getByTestId('cart-payments')).getByTestId(`tender-leg-${leg(0)}-void`)); });
    expect(hook).toHaveBeenCalledTimes(1);
    expect(text('tender-ledger-remaining')).toBe(money(3500));
    await settle(undefined);
    expect(text(`tender-leg-${leg(0)}-status`)).toBe('Cancelled');
    expect(text('tender-ledger-remaining')).toBe(money(5000));
  });

  it("B1 one leg's hook runs once across the pane's ledger and Cart's ledger (#1271)", async () => {
    const { hook, settle } = later();
    render(<SaleHarness settings={settings}>{(sale) => <><Tender sale={sale} beforeVoid={hook} /><Cart sale={sale} showTotal={false} tenderLedger={{ beforeVoid: hook }} /></>}</SaleHarness>);
    act(() => sale.add(blue, traits));
    act(() => sale.setUnitPrice(sale.order.lineItems[0].id, 5000));
    act(() => sale.startTender('cash'));
    act(() => { sale.addTender({ method: 'external', amountMinor: 1500 }); });
    await act(async () => { fireEvent.click(within(screen.getByTestId('tender-pane')).getByTestId(`tender-leg-${leg(0)}-void`)); });
    await act(async () => { fireEvent.click(within(screen.getByTestId('cart-payments')).getByTestId(`tender-leg-${leg(0)}-void`)); });
    expect(hook).toHaveBeenCalledTimes(1);
    await settle(undefined);
    expect(within(screen.getByTestId('cart-payments')).getByTestId(`tender-leg-${leg(0)}-status`).textContent).toBe('Cancelled');
    expect(sale.order.paidMinor).toBe(0);
  });

  it('B2 afterVoid gets the leg and true after an approved void', async () => {
    const afterVoid = vi.fn<(leg: Payment, voided: boolean) => void>();
    guarded(vi.fn<Hook>(async () => undefined), false, afterVoid);
    await act(async () => { fireEvent.click(screen.getByTestId(`tender-leg-${leg(1)}-void`)); });
    expect(afterVoid).toHaveBeenCalledTimes(1);
    expect(afterVoid.mock.calls[0]).toEqual([expect.objectContaining({ id: leg(1) }), true]);
  });

  it('B3 afterVoid gets false when the leg is voided elsewhere while the hook awaits', async () => {
    const { hook, settle } = later();
    const afterVoid = vi.fn<(leg: Payment, voided: boolean) => void>();
    guarded(hook, false, afterVoid);
    await act(async () => { fireEvent.click(screen.getByTestId(`tender-leg-${leg(1)}-void`)); });
    act(() => { sale.voidTender(leg(1)); });
    await settle(undefined);
    expect(afterVoid).toHaveBeenCalledTimes(1);
    expect(afterVoid.mock.calls[0][1]).toBe(false);
    expect(sale.order.paidMinor).toBe(1000);
  });

  it('B4 afterVoid is not called when the hook refuses or throws', async () => {
    const afterVoid = vi.fn<(leg: Payment, voided: boolean) => void>();
    guarded(vi.fn<Hook>(async () => false), false, afterVoid);
    await act(async () => { fireEvent.click(screen.getByTestId(`tender-leg-${leg(1)}-void`)); });
    expect(sale.order.paidMinor).toBe(2500);
    cleanup();
    guarded(vi.fn<Hook>(() => { throw new Error('journal down'); }), false, afterVoid);
    await act(async () => { fireEvent.click(screen.getByTestId(`tender-leg-${leg(1)}-void`)); });
    expect(sale.order.paidMinor).toBe(2500);
    expect(afterVoid).not.toHaveBeenCalled();
  });
});
