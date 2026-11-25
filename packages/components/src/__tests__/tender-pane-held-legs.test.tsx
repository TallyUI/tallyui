// Held legs (desk 2026-11-21): money taken before a sale was reopened keeps no reference input and no Cancel payment.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { createOrderBuilder, NOTHING_DUE, orderDraftSchema, TaxProvider, taxProviderProps, tillLegsTheStoreRefuses, useSale, writeOrderDraft } from '@tallyui/pos';
import { Tender } from '../sale/tender';
import { blue, pricing, SaleHarness, sale, traits } from './sale-harness';

const settings = { ...pricing, taxRatesPpm: { default: 0 } };
const taxContext = { getTaxRatePpm: () => 0, pricesIncludeTax: false };
const reference = () => screen.queryByRole('textbox', { name: 'Terminal reference' });
let db: RxDatabase<{ pos_drafts: RxCollection }> | undefined;
afterEach(async () => { cleanup(); await db?.remove(); db = undefined; });

describe('TenderPane held legs: the terminal reference', () => {
  it('P1 the one captured card leg startTender records for the total takes a reference', () => {
    render(<SaleHarness settings={settings}>{(sale) => <Tender sale={sale} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    act(() => sale.setUnitPrice(sale.order.lineItems[0].id, 5000));
    act(() => sale.startTender('external'));
    expect(sale.order.payments).toMatchObject([{ method: 'external', amountMinor: 5000 }]);
    expect(sale.order.balanceDueMinor).toBe(0);
    expect(reference()).toBeTruthy();
  });

  it('P1 a reopened card leg for the total, resumed from its draft, takes none', async () => {
    db = await createRxDatabase({ name: `heldpane${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    await db.addCollections({ pos_drafts: { schema: orderDraftSchema } });
    const builder = createOrderBuilder({ currency: 'EUR', taxContext });
    builder.addLine({ productId: 'coffee', name: 'Coffee', unitPrice: { amount: 5000, currency: 'EUR' } });
    builder.addPayment({ id: 'leg-1', method: 'external', amountMinor: 5000, reference: 'T-1', reopened: true });
    await writeOrderDraft(db.pos_drafts, builder.getSnapshot());
    let held!: ReturnType<typeof useSale>;
    function Held({ drafts }: { drafts: RxCollection }) {
      held = useSale(settings, { registerId: 'register-1', cashierRef: 'cashier', drafts });
      return <Tender sale={held} />;
    }
    render(<TaxProvider {...taxProviderProps(settings)}><Held drafts={db.pos_drafts} /></TaxProvider>);
    await act(async () => { expect(await held.resume(builder.getSnapshot().id)).toBeNull(); });
    act(() => held.startTender('external'));
    expect(held.stage.kind).toBe('tender');
    expect(held.order.payments).toMatchObject([{ method: 'external', amountMinor: 5000, reopened: true, reference: 'T-1' }]);
    expect(held.order.payments[0].status ?? 'captured').toBe('captured');
    expect(held.order.balanceDueMinor).toBe(0);
    expect(reference()).toBeNull();
  });
});

describe('TenderPane held legs: Cancel payment (ADR-090 gate 36c; ADR-072 d3, amended 2026-11-22)', () => {
  it('P2 among the legs the store refuses, Cancel payment shows for a live leg and not for a reopened one, and voids it', () => {
    // tender.test.tsx's reopen(): a store order whose locked €10 leg covers the total, plus a reopened €5 cash leg.
    const builder = createOrderBuilder({ currency: 'EUR', taxContext, storeOrder: { id: '41', revision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298' } });
    builder.addLine({ productId: 'coffee', name: 'Coffee', storeLineId: '7', unitPrice: { amount: 1000, currency: 'EUR' } });
    builder.addPayment({ method: 'external', amountMinor: 1000, reference: 'Cash', storePaymentId: 'p1', locked: true });
    const reopened = 'leg-reopened';
    builder.addPayment({ id: reopened, method: 'cash', amountMinor: 500, reopened: true });
    render(<SaleHarness settings={settings}>{(sale) => <Tender sale={sale} />}</SaleHarness>);
    act(() => { expect(sale.openStoreOrder(builder.getSnapshot())).toBeNull(); });
    act(() => sale.startTender('cash'));
    // addTender refuses cash with nothing due, so the live till leg goes on through setTender, which keeps the reopened leg.
    act(() => { expect(sale.addTender({ method: 'cash', amountMinor: 500 })).toBeNull(); });
    expect(sale.error).toBe(NOTHING_DUE);
    act(() => sale.setTender({ method: 'cash', amountMinor: 500 }));
    expect(sale.order.payments.map((payment) => payment.id)).toContain(reopened);
    const live = sale.order.payments.find((payment) => !payment.locked && !payment.reopened)!.id;
    expect(tillLegsTheStoreRefuses(sale.order)).toEqual([reopened, live]);
    expect(screen.getByTestId('tender-store-holds')).toBeTruthy();
    expect(screen.getByTestId(`tender-leg-${live}-refused-void`)).toBeTruthy();
    expect(screen.queryByTestId(`tender-leg-${reopened}-refused-void`)).toBeNull();
    fireEvent.click(screen.getByTestId(`tender-leg-${live}-refused-void`));
    expect(sale.order.payments.find((payment) => payment.id === live)?.status).toBe('voided');
    expect(sale.order.payments.map((payment) => payment.id)).toContain(reopened);
  });
});

describe('TenderPane held legs: a resumed draft\'s unstamped leg (row 516, #1209 N3)', () => {
  type Leg = Parameters<ReturnType<typeof createOrderBuilder>['addPayment']>[0];
  let held!: ReturnType<typeof useSale>;
  function Held({ drafts }: { drafts: RxCollection }) {
    held = useSale(settings, { registerId: 'register-1', cashierRef: 'cashier', drafts });
    return <Tender sale={held} />;
  }
  async function open() {
    db = await createRxDatabase({ name: `heldresume${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    await db.addCollections({ pos_drafts: { schema: orderDraftSchema } });
    render(<TaxProvider {...taxProviderProps(settings)}><Held drafts={db.pos_drafts} /></TaxProvider>);
  }
  /** A draft with one line of 5000 and `legs`, none with a takenAt, resumed. */
  async function resumed(...legs: Leg[]) {
    await open();
    const builder = createOrderBuilder({ currency: 'EUR', taxContext });
    builder.addLine({ productId: 'coffee', name: 'Coffee', unitPrice: { amount: 5000, currency: 'EUR' } });
    for (const leg of legs) builder.addPayment(leg);
    await writeOrderDraft(db!.pos_drafts, builder.getSnapshot());
    await act(async () => { expect(await held.resume(builder.getSnapshot().id)).toBeNull(); });
    expect(held.order.payments.every((p) => p.takenAt === undefined)).toBe(true);
  }
  const type = (text: string) => fireEvent.change(reference()!, { target: { value: text } });

  it('T1 a captured card leg for the total takes no reference', async () => {
    await resumed({ id: 'leg-1', method: 'external', amountMinor: 5000, reference: 'T-1' });
    act(() => held.startTender('external'));
    expect(held.order.payments).toMatchObject([{ id: 'leg-1', method: 'external', amountMinor: 5000, reference: 'T-1' }]);
    expect(reference()).toBeNull();
  });

  it('T2 the till\'s own setTender leg, parked and resumed, takes no reference', async () => {
    await open();
    act(() => held.add(blue, traits));
    act(() => held.setUnitPrice(held.order.lineItems[0].id, 5000));
    act(() => held.setTender({ method: 'external', amountMinor: held.order.totalMinor }));
    const id = held.order.id;
    await act(async () => { expect(await held.park()).toBeNull(); });
    await act(async () => { expect(await held.resume(id)).toBeNull(); });
    expect(held.order.payments).toHaveLength(1);
    expect(held.order.payments[0].takenAt).toBeUndefined();
    act(() => held.startTender('external'));
    expect(held.order.payments).toMatchObject([{ method: 'external', amountMinor: 5000 }]);
    expect(reference()).toBeNull();
  });

  it('T3 the second card leg for the rest takes the reference, and typing keeps the resumed leg', async () => {
    await resumed({ id: 'leg-1', method: 'external', amountMinor: 2000, reference: 'T-1' });
    act(() => held.startTender('external'));
    expect(held.order.payments).toMatchObject([{ id: 'leg-1', amountMinor: 2000 }, { method: 'external', amountMinor: 3000 }]);
    expect(held.order.balanceDueMinor).toBe(0);
    expect(reference()).toBeTruthy();
    expect((reference() as HTMLInputElement).value).toBe('');
    type('T-9');
    expect(held.order.payments).toHaveLength(2);
    expect(held.order.payments[0]).toMatchObject({ id: 'leg-1', method: 'external', amountMinor: 2000, reference: 'T-1' });
    expect(held.order.payments[1]).toMatchObject({ method: 'external', amountMinor: 3000, reference: 'T-9' });
  });

  it('T4 once the resumed leg is voided, the new card leg takes the reference', async () => {
    await resumed({ id: 'leg-1', method: 'external', amountMinor: 5000, reference: 'T-1' });
    act(() => { expect(held.voidTender('leg-1')).toBe(true); });
    act(() => held.startTender('external'));
    expect(reference()).toBeTruthy();
    type('T-9');
    expect(held.order.payments.find((p) => p.id === 'leg-1')).toMatchObject({ status: 'voided' });
    const live = held.order.payments.filter((p) => p.id !== 'leg-1');
    expect(live).toMatchObject([{ method: 'external', amountMinor: 5000, reference: 'T-9' }]);
    expect(live[0].status ?? 'captured').toBe('captured');
  });

  it('T5 a pending resumed leg leaves no in-place reference input', async () => {
    await resumed({ id: 'leg-1', method: 'external', amountMinor: 2000, status: 'pending' });
    act(() => held.startTender('external'));
    // 2000 is still due while the leg is pending, so the entry shows its own reference field for the next take.
    const entry = screen.getByTestId('tender-entry');
    expect(screen.queryAllByRole('textbox', { name: 'Terminal reference' }).filter((input) => !entry.contains(input))).toEqual([]);
  });

  it('T6 a card leg parked beside a cash leg takes no reference', async () => {
    await resumed({ id: 'cash-1', method: 'cash', amountMinor: 1000 }, { id: 'leg-1', method: 'external', amountMinor: 4000 });
    act(() => held.startTender('external'));
    expect(held.order.payments).toMatchObject([{ id: 'cash-1' }, { id: 'leg-1' }]);
    expect(reference()).toBeNull();
  });
});
