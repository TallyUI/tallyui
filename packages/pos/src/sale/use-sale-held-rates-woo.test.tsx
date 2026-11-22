import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { wooProductTraits as traits } from '@tallyui/connector-woocommerce';
import type { TaxRounding } from '@tallyui/core';
import { orderDraftSchema, type Order } from '../order';
import { posOrderCollection, type PosOrder } from '../pos-order';
import { TaxProvider } from '../tax';
import { catalogueEntries } from './catalogue';
import { useSale } from './use-sale';

// Row 497: a paid Woo draft resumed after a rate change keeps its parked rates on its line, fee and shipping until the void.
const entries = catalogueEntries([{ id: 10, name: 'Shirt', price: '10.00', categories: [{ id: 7, name: 'Clothes' }] }], traits, { currency: 'GBP' });
const woocommerce: TaxRounding = { granularity: 'woocommerce', roundAtSubtotal: false };
const taxProps = { pricesIncludeTax: false, // exclusive, so a rate change moves the total
  ratesPpm: { default: 200000 }, taxRates: { standard: [
  { id: 1, code: 'rate-1', label: 'VAT', rate: '20.0000', priority: 1, compound: false, shipping: true },
] } };
type Sale = { current: ReturnType<typeof useSale> };
const settle = () => act(async () => { for (let k = 0; k < 4; k++) await new Promise((resolve) => setTimeout(resolve, 0)); });

describe('useSale holds a paid Woo draft\'s parked rates (row 497)', () => {
  let db: RxDatabase;
  beforeEach(async () => {
    db = await createRxDatabase({ name: `saleheld${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    await db.addCollections({ pos_drafts: { schema: orderDraftSchema }, pos_orders: posOrderCollection() });
  });
  afterEach(async () => { cleanup(); await db.remove(); });

  // Copied from use-sale-kept-coupons-woo.test.tsx (`parkPaid`, `voidLeg`, `driftedResume` with no coupon).
  async function parkPaid(result: Sale, parked: () => void) {
    act(() => { expect(result.current.addTender({ method: 'cash', amountMinor: 500 })).toEqual(expect.any(String)); });
    const order = result.current.order;
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    parked();
    await act(async () => { expect(await result.current.resume(order.id)).toBeNull(); });
    await settle();
    return order;
  }
  async function voidLeg(result: Sale) {
    const leg = result.current.order.payments[0].id;
    act(() => { expect(result.current.voidTender(leg)).toBe(true); });
    await settle();
  }
  function renderAt(state: { pct: number }) {
    function Wrapper({ children }: { children: ReactNode }) {
      const rated = { ...taxProps, ratesPpm: { default: state.pct * 10000 },
        taxRates: { standard: [{ ...taxProps.taxRates.standard[0], rate: `${state.pct}.0000` }] } };
      return <TaxProvider {...rated} rounding={woocommerce}>{children}</TaxProvider>;
    }
    const onSaleCompleted = vi.fn(async (order: PosOrder) => { await db.pos_orders.insert(order); });
    const view = renderHook(() => useSale({ currency: 'GBP' }, { registerId: 'register-1', cashierRef: 'cashier@store.test',
      capabilities: { orderCreate: 6, coupons: true }, drafts: db.pos_drafts, onSaleCompleted }), { wrapper: Wrapper });
    act(() => {
      view.result.current.add(entries[0], traits);
      expect(view.result.current.addFee({ name: 'Fee', amountMinor: 500, taxStatus: 'taxable' })).toEqual({ id: expect.any(String) });
      expect(view.result.current.addShipping({ name: 'Post', amountMinor: 300, taxStatus: 'taxable' })).toEqual({ id: expect.any(String) });
    });
    return view;
  }
  /** A line, fee and shipping with a captured 500 cash leg, parked at 20 %, resumed after the rate moves to 10 %. */
  async function driftedResume() {
    const state = { pct: 20 };
    const { result, rerender } = renderAt(state);
    const parked: Order = await parkPaid(result, () => { state.pct = 10; rerender(); });
    await settle();
    return { result, parked };
  }
  const rates = (order: Pick<Order, 'lineItems' | 'fees' | 'shipping'>) =>
    [...order.lineItems, ...order.fees ?? [], ...order.shipping ?? []].map((item) => item.taxLines[0].ratePpm);

  it('U1: a paid resume keeps the parked total and completes with the parked rates', async () => {
    const { result, parked } = await driftedResume();
    expect(rates(parked)).toEqual([200000, 200000, 200000]);
    expect(result.current.order.totalMinor).toBe(parked.totalMinor);
    act(() => { result.current.startTender('external'); });
    await settle();
    expect(result.current.order.payments[1]).toEqual(expect.objectContaining({ method: 'external', amountMinor: parked.totalMinor - 500 }));
    await act(async () => { await result.current.complete(); });
    expect(result.current.error).toBeNull();
    type Stored = { lines: Order['lineItems']; fees?: Order['fees']; shipping?: Order['shipping'] };
    const [row] = (await db.pos_orders.find().exec()).map((doc) => doc.toJSON() as unknown as Stored);
    expect(rates({ ...row, lineItems: row.lines })).toEqual([200000, 200000, 200000]);
  });

  it('U2: after the void the total is a fresh sale\'s at today\'s rate', async () => {
    const { result, parked } = await driftedResume();
    await voidLeg(result);
    const fresh = renderAt({ pct: 10 });
    expect(result.current.order.totalMinor).not.toBe(parked.totalMinor);
    expect(result.current.order.totalMinor).toBe(fresh.result.current.order.totalMinor);
    expect(rates(result.current.order)).toEqual([100000, 100000, 100000]);
  });
});
