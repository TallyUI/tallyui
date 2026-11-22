import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { wooProductTraits as traits } from '@tallyui/connector-woocommerce';
import type { TaxRounding } from '@tallyui/core';
import { orderDraftSchema, type Order } from '../order';
import { posOrderCollection } from '../pos-order';
import { TaxProvider } from '../tax';
import { catalogueEntries } from './catalogue';
import type { SaleCoupon, SaleCouponSource } from './woocommerce/coupons';
import { createDiscountCodes } from './woocommerce/discount-codes';
import type { SaleDiscountCodes as DiscountCodes } from './discount-codes';
import { createStorePricedDiscountCodes, type StorePricedDiscountCodesOptions } from './store-priced-discount-codes';
import { useSale } from './use-sale';

const entries = catalogueEntries([
  { id: 10, name: 'Shirt', price: '10.00', categories: [{ id: 7, name: 'Clothes' }] },
  { id: 20, name: 'Mug', price: '10.00', categories: [{ id: 8, name: 'Home' }] },
  { id: 30, name: 'Cap', price: '9.99', categories: [{ id: 7, name: 'Clothes' }] },
  { id: 40, name: 'Cup', price: '9.97', categories: [{ id: 8, name: 'Home' }] },
], traits, { currency: 'GBP' });
const woocommerce: TaxRounding = { granularity: 'woocommerce', roundAtSubtotal: false };
const perOrder: TaxRounding = { granularity: 'per_order', mode: 'half_away_from_zero' };
const taxProps = { pricesIncludeTax: true, ratesPpm: { default: 200000 }, taxRates: { standard: [
  { id: 1, code: 'rate-1', label: 'VAT', rate: '20.0000', priority: 1, compound: false, shipping: true },
] } };
type Sale = { current: ReturnType<typeof useSale> };
type Price = StorePricedDiscountCodesOptions['price'];

// Copied from use-sale-coupons.test.tsx: `coupon()` and `source()`, the smallest Woo coupon fixture there.
function coupon(code = 'ten', extra: Partial<SaleCoupon> = {}): SaleCoupon {
  return { id: 101, code, discount_type: 'percent', amount: '10', ...extra };
}
function source(coupons = [coupon()]) {
  const data = new Map(coupons.map((value) => [value.code, value]));
  const categories = new Map([[10, [{ id: 7 }]], [20, [{ id: 8 }]]]);
  return { data,
    find: vi.fn(async (code: string) => data.get(code) ?? null),
    productCategories: vi.fn(async (ids: readonly number[]) => new Map([...categories].filter(([id]) => ids.includes(id)))),
  } satisfies SaleCouponSource & { data: Map<string, SaleCoupon> };
}
const settle = () => act(async () => { for (let k = 0; k < 4; k++) await new Promise((resolve) => setTimeout(resolve, 0)); });
const lineFigures = (order: Order) => order.lineItems.map(({ netMinor, netMicros, totalMinor, taxLines }) => ({ netMinor, netMicros, totalMinor, taxLines }));
const totals = ({ subtotalMinor, discountMinor, taxMinor, totalMinor, paidMinor, balanceDueMinor }: Order) => ({ subtotalMinor, discountMinor, taxMinor, totalMinor, paidMinor, balanceDueMinor });

describe('useSale kept coupons on a paid resume (Woo and generic inclusive)', () => {
  let db: RxDatabase;
  beforeEach(async () => {
    db = await createRxDatabase({ name: `salekept${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    await db.addCollections({ pos_drafts: { schema: orderDraftSchema }, pos_orders: posOrderCollection() });
  });
  afterEach(async () => { cleanup(); await db.remove(); });

  function renderSale(discountCodes: DiscountCodes, rounding: TaxRounding = woocommerce) {
    function Wrapper({ children }: { children: ReactNode }) {
      return <TaxProvider {...taxProps} rounding={rounding}>{children}</TaxProvider>;
    }
    return renderHook(() => useSale({ currency: 'GBP' }, { registerId: 'register-1', cashierRef: 'cashier@store.test',
      capabilities: { orderCreate: 6, coupons: true }, drafts: db.pos_drafts, discountCodes }), { wrapper: Wrapper });
  }
  async function apply(result: Sale, code: string) {
    await act(async () => { expect(await result.current.applyCoupon(code)).toBeNull(); });
  }
  /** Parks the sale with a captured 500 cash leg, runs `parked`, resumes it and returns the parked order. */
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

  it('T5: a paid resume keeps the parked Woo replay figures; after the void the replay uses the new config', async () => {
    const coupons = source();
    const { result } = renderSale(createDiscountCodes(coupons));
    act(() => { result.current.add(entries[0], traits); });
    await apply(result, 'ten');
    const parked = await parkPaid(result, () => {
      coupons.data.set('ten', coupon('ten', { amount: '25' }));
      coupons.find.mockClear();
    });
    const order = result.current.order;
    expect(order.coupons).toEqual(parked.coupons);
    expect(lineFigures(order)).toEqual(lineFigures(parked));
    expect(order.display).toEqual(parked.display);
    expect(totals(order)).toEqual(totals(parked));
    expect(result.current.error).toBeNull();
    expect(coupons.find).not.toHaveBeenCalled();

    await voidLeg(result);
    expect(coupons.find).toHaveBeenCalled();
    const fresh = renderSale(createDiscountCodes(source([coupon('ten', { amount: '25' })])));
    act(() => { fresh.result.current.add(entries[0], traits); });
    await apply(fresh.result, 'ten');
    expect(result.current.order.totalMinor).not.toBe(parked.totalMinor);
    expect(result.current.order.totalMinor).toBe(fresh.result.current.order.totalMinor);
    expect(result.current.order.coupons).toEqual(fresh.result.current.order.coupons);
  });

  it('T6: a Woo coupon deleted after the park stays on a paid resume, and goes with the removal message after the void', async () => {
    const coupons = source();
    const { result } = renderSale(createDiscountCodes(coupons));
    act(() => { result.current.add(entries[0], traits); });
    await apply(result, 'ten');
    const parked = await parkPaid(result, () => { coupons.data.delete('ten'); });
    expect(result.current.order.coupons).toEqual(parked.coupons);
    expect(result.current.error).toBeNull();

    await voidLeg(result);
    expect(result.current.order.coupons).toBeUndefined();
    expect(result.current.error).toBe('Coupon ten was removed: Coupon ten does not exist.');
  });

  it('T7: generic inclusive rounding, two codes over two lines and a taxed fee: a paid resume keeps the parked coupons, display and totals', async () => {
    const perUnit: Record<string, number> = { a: 7, b: 11 };
    const price = vi.fn<Price>(async (codes, sale) => ({ priced: new Map(codes.map((code) => [code, { couponId: `id-${code}`,
      lines: sale.order.lineItems.map((line) => ({ lineId: line.id, amountMinor: perUnit[code] * line.quantity })) }])) }));
    const { result } = renderSale(createStorePricedDiscountCodes({ price }), perOrder);
    act(() => { result.current.add(entries[2], traits); result.current.add(entries[3], traits); });
    act(() => { expect(result.current.addFee({ name: 'Fee', amountMinor: 333, taxStatus: 'taxable' })).toEqual({ id: expect.any(String) }); });
    await apply(result, 'a');
    await apply(result, 'b');
    expect(result.current.order.coupons?.map(({ lines }) => lines?.length)).toEqual([2, 2]);
    const parked = await parkPaid(result, () => { perUnit.a = 50; perUnit.b = 60; price.mockClear(); });
    const order = result.current.order;
    expect(order.coupons).toEqual(parked.coupons);
    expect(order.display).toEqual(parked.display);
    expect(totals(order)).toEqual(totals(parked));
    expect(result.current.error).toBeNull();
    expect(price).not.toHaveBeenCalled();
  });

  /** Woo 'ten' on entries[0] with a captured 500 cash leg, parked at 20 %, resumed after the rate moves to 10 % (F5). */
  async function driftedResume() {
    const state = { pct: 20 };
    function Wrapper({ children }: { children: ReactNode }) {
      const rated = { ...taxProps, ratesPpm: { default: state.pct * 10000 },
        taxRates: { standard: [{ ...taxProps.taxRates.standard[0], rate: `${state.pct}.0000` }] } };
      return <TaxProvider {...rated} rounding={woocommerce}>{children}</TaxProvider>;
    }
    const onSaleCompleted = vi.fn(async (order: unknown) => { await db.pos_orders.insert(order); });
    const { result, rerender } = renderHook(() => useSale({ currency: 'GBP' }, { registerId: 'register-1', cashierRef: 'cashier@store.test',
      capabilities: { orderCreate: 6, coupons: true }, drafts: db.pos_drafts, discountCodes: createDiscountCodes(source()), onSaleCompleted }), { wrapper: Wrapper });
    act(() => { result.current.add(entries[0], traits); });
    await apply(result, 'ten');
    const parked = await parkPaid(result, () => { state.pct = 10; rerender(); });
    await settle();
    return { result, parked };
  }

  it('D1/D2 (F5): a paid Woo draft stays priced when the rate moves between park and resume, tenders the balance and completes', async () => {
    const { result, parked } = await driftedResume();
    const order = result.current.order;
    expect(order.couponPricesStale ?? false).toBe(false);
    expect(result.current.error).toBeNull();
    expect(order.totalMinor).toBe(parked.totalMinor);
    expect(order.coupons).toEqual(parked.coupons);
    expect(lineFigures(order)).toEqual(lineFigures(parked));
    expect(totals(order)).toEqual(totals(parked));
    const [cash] = order.payments;
    act(() => { result.current.startTender('external'); });
    await settle();
    expect(result.current.error).toBeNull();
    expect(result.current.stage).toEqual({ kind: 'tender', method: 'external' });
    expect(result.current.order.payments).toEqual([cash, expect.objectContaining({ method: 'external', amountMinor: parked.totalMinor - 500 })]);
    await act(async () => { await result.current.complete(); });
    expect(result.current.error).toBeNull();
    expect(result.current.stage.kind).toBe('receipt');
  });

  it('D3 (F5): after a drifted paid resume, a pricing-basis change still makes the kept coupons stale', async () => {
    const { result } = await driftedResume();
    expect(result.current.order.couponPricesStale ?? false).toBe(false);
    // The live leg refuses a quantity edit (SALE_HAS_PAYMENT); the customer is in the kept basis and not in linesBasis.
    act(() => { result.current.setCustomer({ id: 'customer-2', name: 'Ada' }); });
    await settle();
    expect(result.current.order.couponPricesStale).toBe(true);
  });
});
