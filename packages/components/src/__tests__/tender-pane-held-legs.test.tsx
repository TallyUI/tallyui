// Held legs (desk 2026-11-21): money taken before a sale was reopened keeps no reference input and no Remove payment.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { createOrderBuilder, orderDraftSchema, TaxProvider, taxProviderProps, tillLegsTheStoreRefuses, useSale, writeOrderDraft } from '@tallyui/pos';
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

describe('TenderPane held legs: Remove payment (ADR-090 gate 36c)', () => {
  it('P2 among the legs the store refuses, Remove shows for a live leg and not for a reopened one', () => {
    // tender.test.tsx's reopen(): a store order whose locked €10 leg covers the total, plus a reopened €5 cash leg.
    const builder = createOrderBuilder({ currency: 'EUR', taxContext, storeOrder: { id: '41', revision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298' } });
    builder.addLine({ productId: 'coffee', name: 'Coffee', storeLineId: '7', unitPrice: { amount: 1000, currency: 'EUR' } });
    builder.addPayment({ method: 'external', amountMinor: 1000, reference: 'Cash', storePaymentId: 'p1', locked: true });
    const reopened = 'leg-reopened';
    builder.addPayment({ id: reopened, method: 'cash', amountMinor: 500, reopened: true });
    render(<SaleHarness settings={settings}>{(sale) => <Tender sale={sale} />}</SaleHarness>);
    act(() => { expect(sale.openStoreOrder(builder.getSnapshot())).toBeNull(); });
    act(() => sale.startTender('cash'));
    let live: string | null = null;
    act(() => { live = sale.addTender({ method: 'cash', amountMinor: 500 }); });
    expect(live).not.toBeNull();
    expect(tillLegsTheStoreRefuses(sale.order)).toEqual([reopened, live]);
    expect(screen.getByTestId('tender-store-holds')).toBeTruthy();
    expect(screen.getByTestId(`tender-leg-${live}-remove`)).toBeTruthy();
    expect(screen.queryByTestId(`tender-leg-${reopened}-remove`)).toBeNull();
    fireEvent.click(screen.getByTestId(`tender-leg-${live}-remove`));
    expect(sale.order.payments.map((payment) => payment.id)).not.toContain(live);
    expect(sale.order.payments.map((payment) => payment.id)).toContain(reopened);
  });
});
