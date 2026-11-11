import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { wooProductTraits as traits } from '@tallyui/connector-woocommerce';
import type { TaxRounding } from '@tallyui/core';
import { orderDraftSchema } from '../order';
import { TaxProvider } from '../tax';
import { catalogueEntries } from './catalogue';
import { COUPONS_NEED_CONNECTION } from './discount-codes';
import { createStorePricedDiscountCodes, type StorePricedDiscountCodesOptions } from './store-priced-discount-codes';
import { createDiscountCodes } from './woocommerce/discount-codes';
import { COUPONS_REPRICING, useSale } from './use-sale';

const entries = catalogueEntries([
  { id: 10, name: 'Shirt', price: '10.00', categories: [{ id: 7, name: 'Clothes' }] },
], traits, { currency: 'GBP' });
const perOrder: TaxRounding = { granularity: 'per_order', mode: 'half_away_from_zero' };
const taxProps = { pricesIncludeTax: false, ratesPpm: { default: 200000 }, taxRates: { standard: [
  { id: 1, code: 'rate-1', label: 'VAT', rate: '20.0000', priority: 1, compound: false, shipping: true },
] } };
type Price = StorePricedDiscountCodesOptions['price'];
type SaleOptions = Parameters<typeof useSale>[1];

/** A scripted store: each code takes `perUnit[code]` off per unit of the first line; `hold()` keeps the next call waiting. */
function store(perUnit: Record<string, number> = { a: 100, b: 50 }) {
  const refusals = new Map<string, string>(), gates: Promise<void>[] = [];
  const control = { refusals, offline: false, lineId: undefined as string | undefined, hold() {
    let open!: () => void;
    gates.push(new Promise<void>((resolve) => { open = resolve; }));
    return () => open();
  } };
  const price = vi.fn<Price>(async (codes, sale) => {
    const line = sale.order.lineItems[0];
    const gate = gates.shift();
    if (gate) await gate;
    if (control.offline) throw new Error('offline');
    const refused = codes.find((code) => refusals.has(code));
    if (refused !== undefined) return { refusal: refusals.get(refused)! };
    return { priced: new Map(codes.map((code) => [code, { couponId: `id-${code}`, lines: [{ lineId: control.lineId ?? line.id, amountMinor: perUnit[code] * line.quantity }] }])) };
  });
  return Object.assign(control, { price, codes: createStorePricedDiscountCodes({ price }) });
}
const settle = () => act(async () => { for (let k = 0; k < 4; k++) await new Promise((resolve) => setTimeout(resolve, 0)); });

describe('useSale store-priced coupon re-pricing (#710)', () => {
  let db: RxDatabase;
  beforeEach(async () => {
    db = await createRxDatabase({ name: `salereprice${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    await db.addCollections({ pos_drafts: { schema: orderDraftSchema } });
  });
  afterEach(async () => { cleanup(); await db.remove(); });

  function renderSale(discountCodes: NonNullable<SaleOptions['discountCodes']>, rounding: TaxRounding = perOrder, overrides: Partial<SaleOptions> = {}) {
    function Wrapper({ children }: { children: ReactNode }) {
      return <TaxProvider {...taxProps} rounding={rounding}>{children}</TaxProvider>;
    }
    const hook = renderHook(() => useSale({ currency: 'GBP' }, {
      registerId: 'register-1', cashierRef: 'cashier@store.test',
      capabilities: { orderCreate: 6, coupons: true }, drafts: db.pos_drafts, discountCodes, ...overrides,
    }), { wrapper: Wrapper });
    act(() => hook.result.current.add(entries[0], traits));
    return { ...hook, line: hook.result.current.order.lineItems[0].id };
  }
  async function apply(result: { current: ReturnType<typeof useSale> }, ...codes: string[]) {
    for (const code of codes) await act(async () => { expect(await result.current.applyCoupon(code)).toBeNull(); });
  }
  const amounts = (result: { current: ReturnType<typeof useSale> }) => result.current.order.coupons?.map(({ code, discountMinor }) => [code, discountMinor]);

  it('prices the accepted codes again when the quantity changes', async () => {
    const shop = store();
    const { result, line } = renderSale(shop.codes);
    await apply(result, 'a');
    const release = shop.hold();
    act(() => result.current.setQuantity(line, 2));
    expect(result.current.order.couponPricesStale).toBe(true);
    expect(result.current.couponsRepricing).toBe(true);
    expect(shop.price).toHaveBeenLastCalledWith(['a'], expect.anything());
    release();
    await settle();
    expect(result.current.couponsRepricing).toBe(false);
    expect(result.current.order).not.toHaveProperty('couponPricesStale');
    expect(amounts(result)).toEqual([['a', 200]]);
    expect(shop.price).toHaveBeenCalledTimes(2);
  });

  it('drops a code the store now refuses and keeps the others', async () => {
    const shop = store();
    const { result, line } = renderSale(shop.codes);
    await apply(result, 'a', 'b');
    shop.refusals.set('a', 'Promotion A has ended');
    act(() => result.current.setQuantity(line, 2));
    await settle();
    expect(result.current.error).toBe('Coupon a was removed: Promotion A has ended.');
    expect(amounts(result)).toEqual([['b', 100]]);
    expect(result.current.order).not.toHaveProperty('couponPricesStale');
  });

  it('keeps the coupons, stale, on a transient failure, and Retry prices them', async () => {
    const shop = store();
    const { result, line } = renderSale(shop.codes);
    await apply(result, 'a');
    shop.offline = true;
    act(() => result.current.setQuantity(line, 2));
    await settle();
    expect(result.current.error).toBe(COUPONS_NEED_CONNECTION);
    expect(amounts(result)).toEqual([['a', 100]]);
    expect(result.current.order.couponPricesStale).toBe(true);
    expect(result.current.couponsRepricing).toBe(false);
    expect(shop.price).toHaveBeenCalledTimes(2); // no retry on the same snapshot
    act(() => result.current.startTender('cash'));
    expect(result.current.error).toBe(COUPONS_REPRICING);
    expect(result.current.stage).toEqual({ kind: 'cart' });
    shop.offline = false;
    await act(async () => { expect(await result.current.repriceCoupons()).toBeNull(); });
    expect(amounts(result)).toEqual([['a', 200]]);
    expect(result.current.order).not.toHaveProperty('couponPricesStale');
    expect(result.current.error).toBeNull();
  });

  it('prices again when the sale changes during a re-price', async () => {
    const shop = store();
    const { result, line } = renderSale(shop.codes);
    await apply(result, 'a');
    const first = shop.hold();
    act(() => result.current.setQuantity(line, 2));
    act(() => result.current.setQuantity(line, 3));
    const second = shop.hold();
    first();
    await settle();
    expect(amounts(result)).toEqual([['a', 200]]); // applied, priced for two
    expect(result.current.order.couponPricesStale).toBe(true);
    expect(result.current.couponsRepricing).toBe(true);
    expect(shop.price).toHaveBeenCalledTimes(3);
    second();
    await settle();
    expect(amounts(result)).toEqual([['a', 300]]);
    expect(result.current.order).not.toHaveProperty('couponPricesStale');
    expect(shop.price).toHaveBeenCalledTimes(3);
  });

  it('discards a re-price that applyCoupon overtook', async () => {
    const shop = store();
    const { result, line } = renderSale(shop.codes);
    await apply(result, 'a');
    const release = shop.hold();
    act(() => result.current.setQuantity(line, 2));
    await apply(result, 'b');
    release();
    await settle();
    expect(amounts(result)).toEqual([['a', 200], ['b', 100]]);
    expect(result.current.order).not.toHaveProperty('couponPricesStale');
    expect(shop.price).toHaveBeenCalledTimes(3);
  });

  it('shows an apply error once, keeping the coupons, and does not price the same snapshot again', async () => {
    const shop = store();
    const { result, line } = renderSale(shop.codes);
    await apply(result, 'a');
    shop.lineId = 'not-a-line';
    act(() => result.current.setQuantity(line, 2));
    await settle();
    expect(result.current.error).toBe('Coupon a prices a line not on the sale');
    expect(amounts(result)).toEqual([['a', 100]]);
    expect(result.current.order.couponPricesStale).toBe(true);
    expect(shop.price).toHaveBeenCalledTimes(2);
  });

  it('keeps a code removed while a re-price was pending', async () => {
    const shop = store();
    const { result, line } = renderSale(shop.codes);
    await apply(result, 'a', 'b');
    const release = shop.hold();
    act(() => result.current.setQuantity(line, 2));
    expect(result.current.couponsRepricing).toBe(true);
    act(() => { expect(result.current.removeCoupon('a')).toBeNull(); });
    release();
    await settle();
    expect(amounts(result)).toEqual([['b', 100]]);
    expect(result.current.order).not.toHaveProperty('couponPricesStale');
    expect(shop.price).toHaveBeenLastCalledWith(['b'], expect.anything());
    // 'a' is no longer accepted, so it can be applied again.
    await act(async () => { expect(await result.current.applyCoupon('a')).toBeNull(); });
  });

  it('prices the remaining codes after removeCoupon', async () => {
    const shop = store();
    const { result } = renderSale(shop.codes);
    await apply(result, 'a', 'b');
    act(() => { expect(result.current.removeCoupon('a')).toBeNull(); });
    await settle();
    expect(shop.price).toHaveBeenLastCalledWith(['b'], expect.anything());
    expect(amounts(result)).toEqual([['b', 50]]);
    expect(result.current.order).not.toHaveProperty('couponPricesStale');
  });

  it('refuses to complete or tender while the coupon prices are stale', async () => {
    const shop = store(), onSaleCompleted = vi.fn();
    const { result, line } = renderSale(shop.codes, perOrder, { onSaleCompleted });
    await apply(result, 'a');
    const release = shop.hold();
    act(() => result.current.setQuantity(line, 2));
    await act(async () => { await result.current.complete(); });
    expect(result.current.error).toBe(COUPONS_REPRICING);
    expect(result.current.saving).toBe(false);
    release();
    await settle();
    shop.offline = true;
    act(() => result.current.setQuantity(line, 3));
    await settle();
    expect(result.current.order.couponPricesStale).toBe(true);
    await act(async () => { await result.current.complete(); });
    expect(result.current.error).toBe(COUPONS_REPRICING);
    act(() => result.current.startTender('cash'));
    expect(result.current.stage).toEqual({ kind: 'cart' });
    expect(onSaleCompleted).not.toHaveBeenCalled();
  });

  it('never re-prices a WooCommerce sale', async () => {
    const find = vi.fn(async (code: string) => ({ id: 101, code, discount_type: 'percent' as const, amount: '10' }));
    const codes = createDiscountCodes({ find, productCategories: async () => new Map() });
    const { result, line } = renderSale(codes, { granularity: 'woocommerce', roundAtSubtotal: false });
    await apply(result, 'ten');
    act(() => result.current.setQuantity(line, 2));
    await settle();
    expect(result.current.couponsRepricing).toBe(false);
    expect(result.current.order).not.toHaveProperty('couponPricesStale');
    expect(result.current.order.coupons).toEqual([expect.objectContaining({ code: 'ten', discountMinor: 200 })]);
    expect(find).toHaveBeenCalledTimes(1);
  });
});
