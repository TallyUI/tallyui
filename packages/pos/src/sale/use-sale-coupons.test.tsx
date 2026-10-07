import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { wooProductTraits as traits } from '@tallyui/connector-woocommerce';
import { orderDraftSchema } from '../order';
import { TaxProvider } from '../tax';
import { catalogueEntries } from './catalogue';
import { COUPONS_UNSUPPORTED, type SaleCoupon, type SaleCouponSource } from './coupons';
import { SALE_SAVING, useSale } from './use-sale';

const entries = catalogueEntries([
  { id: 10, name: 'Shirt', price: '10.00', categories: [{ id: 7, name: 'Clothes' }] },
  { id: 20, name: 'Mug', price: '10.00', categories: [{ id: 8, name: 'Home' }] },
], traits, { currency: 'GBP' });
const rounding = { granularity: 'woocommerce' as const, roundAtSubtotal: false };
const taxProps = { pricesIncludeTax: false, ratesPpm: { default: 200000 }, taxRates: { standard: [
  { id: 1, code: 'rate-1', label: 'VAT', rate: '20.0000', priority: 1, compound: false, shipping: true },
] } };
type SaleOptions = Parameters<typeof useSale>[1];
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

describe('useSale coupons', () => {
  let db: RxDatabase;
  beforeEach(async () => {
    db = await createRxDatabase({ name: `salecoupons${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    await db.addCollections({ pos_drafts: { schema: orderDraftSchema } });
  });
  afterEach(async () => { cleanup(); await db.remove(); });

  function renderSale(coupons: SaleCouponSource | undefined, overrides: Partial<SaleOptions> = {}, woo = true) {
    function Wrapper({ children }: { children: ReactNode }) {
      return <TaxProvider {...taxProps} rounding={woo ? rounding : undefined}>{children}</TaxProvider>;
    }
    const options: SaleOptions = { registerId: 'register-1', cashierRef: 'cashier@store.test',
      capabilities: { orderCreate: 6, coupons: true }, drafts: db.pos_drafts, coupons, ...overrides };
    return { ...renderHook((opts: SaleOptions) => useSale({ currency: 'GBP' }, opts), { wrapper: Wrapper, initialProps: options }), options };
  }
  function add(result: { current: ReturnType<typeof useSale> }, index = 0) {
    act(() => result.current.add(entries[index], traits));
  }

  it('applies a percent coupon with the connector id and a positive discount', async () => {
    const { result } = renderSale(source());
    add(result);
    const before = result.current.order.totalMinor;
    await act(async () => { expect(await result.current.applyCoupon('ten')).toBeNull(); });
    expect(result.current.order.coupons).toEqual([
      { code: 'ten', couponId: '101', discountMinor: 100, discountTaxMinor: 20 },
    ]);
    expect(result.current.order.totalMinor).toBeLessThan(before);
    expect(result.current.error).toBeNull();
  });

  it.each(['absent capability', 'false capability', 'no source', 'non-WooCommerce'])('refuses with %s before looking up a coupon', async (gate) => {
    const coupons = source();
    const capabilities = gate === 'absent capability' ? { orderCreate: 3 as const }
      : { orderCreate: 3 as const, coupons: gate !== 'false capability' };
    const { result } = renderSale(gate === 'no source' ? undefined : coupons, { capabilities }, gate !== 'non-WooCommerce');
    add(result);
    const before = result.current.order;
    await act(async () => { expect(await result.current.applyCoupon('ten')).toBe(COUPONS_UNSUPPORTED); });
    expect(coupons.find).not.toHaveBeenCalled();
    expect(result.current.order).toBe(before);
  });

  it('refuses coupons when the store only accepts order.create version 5', async () => {
    const { result } = renderSale(source(), { capabilities: { orderCreate: 5, coupons: true } });
    add(result);
    await act(async () => { expect(await result.current.applyCoupon('ten')).toBe(COUPONS_UNSUPPORTED); });
    expect(result.current.order.coupons).toBeUndefined();
  });

  it('normalizes codes, refuses empty and unknown codes, and does not fetch duplicates', async () => {
    const coupons = source();
    const { result } = renderSale(coupons);
    add(result);
    await act(async () => { expect(await result.current.applyCoupon('  ')).toBe('Enter a coupon code'); });
    expect(coupons.find).not.toHaveBeenCalled();
    await act(async () => { expect(await result.current.applyCoupon('x')).toBe('Coupon x does not exist'); });
    expect(result.current.order.coupons).toBeUndefined();
    await act(async () => { expect(await result.current.applyCoupon('  TEN ')).toBeNull(); });
    expect(result.current.order.coupons?.map(({ code }) => code)).toEqual(['ten']);
    expect(coupons.find.mock.calls).toEqual([['x'], ['ten']]);
    const before = result.current.order;
    await act(async () => { expect(await result.current.applyCoupon('TEN')).toBe('Coupon ten is already applied'); });
    expect(coupons.find).toHaveBeenCalledTimes(2);
    expect(result.current.order).toBe(before);
  });

  it.each([
    [coupon('x', { date_expires_gmt: '2000-01-01T00:00:00' }), 'Coupon x has expired'],
    [coupon('x', { minimum_amount: '20.00' }), 'Coupon x needs a spend of at least 20.00'],
    [coupon('x', { individual_use: true }), 'Coupon x cannot be used with other coupons'],
  ] as const)('returns the validator refusal for %j', async (refused, message) => {
    const { result } = renderSale(source([coupon(), refused]));
    add(result);
    await act(async () => { expect(await result.current.applyCoupon('ten')).toBeNull(); });
    const before = result.current.order;
    await act(async () => { expect(await result.current.applyCoupon('x')).toBe(message); });
    expect(result.current.order).toBe(before);
  });

  it('passes categories from add to validation and replay, discounting only the matching line', async () => {
    const coupons = source([coupon('category', { product_categories: [7] })]);
    const { result } = renderSale(coupons);
    add(result); add(result, 1);
    const before = result.current.order;
    await act(async () => { expect(await result.current.applyCoupon('category')).toBeNull(); });
    expect(result.current.order.lineItems.map(({ netMinor }) => netMinor)).toEqual([900, 1000]);
    expect(result.current.order.lineItems[1]).toEqual(before.lineItems[1]);
    expect(result.current.order.coupons?.[0].discountMinor).toBe(100);
    expect(coupons.productCategories).not.toHaveBeenCalled();
  });

  it('returns a builder refusal without applying the coupon', async () => {
    const { result } = renderSale(source([coupon('x', { exclude_sale_items: true })]));
    add(result);
    const before = result.current.order;
    await act(async () => { expect(await result.current.applyCoupon('x')).toBe('Coupon x excludes sale items'); });
    expect(result.current.order).toBe(before);
    expect(result.current.order.coupons).toBeUndefined();
  });

  it('removes normalized codes even after capability loss, and ignores codes that are not applied', async () => {
    const { result, rerender, options } = renderSale(source());
    add(result);
    const total = result.current.order.totalMinor;
    await act(async () => { expect(await result.current.applyCoupon('ten')).toBeNull(); });
    const before = result.current.order;
    act(() => { expect(result.current.removeCoupon('missing')).toBeNull(); });
    expect(result.current.order).toBe(before);
    rerender({ ...options, capabilities: { orderCreate: 3, coupons: false } });
    act(() => { expect(result.current.removeCoupon(' TEN ')).toBeNull(); });
    expect(result.current.order.coupons).toBeUndefined();
    expect(result.current.order.totalMinor).toBe(total);
  });

  it('refuses applying and removing while a failed save is pending', async () => {
    const coupons = source();
    const onSaleCompleted = vi.fn(async () => { throw new Error('Storage full'); });
    const { result } = renderSale(coupons, { onSaleCompleted });
    add(result);
    act(() => result.current.startTender('external'));
    await act(async () => { await result.current.complete(); });
    expect(onSaleCompleted).toHaveBeenCalledOnce();
    expect(result.current.saving).toBe(true);
    expect(result.current.error).toBe('The sale could not be saved: Storage full');
    const before = result.current.order;
    await act(async () => { expect(await result.current.applyCoupon('ten')).toBe(SALE_SAVING); });
    act(() => { expect(result.current.removeCoupon('ten')).toBe(SALE_SAVING); });
    expect(result.current.order).toBe(before);
    expect(coupons.find).not.toHaveBeenCalled();
  });

  it('clears applied coupons for a new sale so the same code can be used again', async () => {
    const { result } = renderSale(source());
    add(result);
    await act(async () => { expect(await result.current.applyCoupon('ten')).toBeNull(); });
    act(() => result.current.newSale());
    expect(result.current.order.coupons).toBeUndefined();
    add(result);
    await act(async () => { expect(await result.current.applyCoupon('ten')).toBeNull(); });
    expect(result.current.order.coupons?.map(({ code }) => code)).toEqual(['ten']);
  });

  it.each(['valid', 'expired', 'missing', 'builder refusal'])('rechecks a parked coupon with fresh data: %s', async (state) => {
    const coupons = source([coupon('x')]);
    const { result } = renderSale(coupons);
    add(result);
    await act(async () => { expect(await result.current.applyCoupon('x')).toBeNull(); });
    const saved = result.current.order;
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    if (state === 'expired') coupons.data.set('x', coupon('x', { date_expires_gmt: '2000-01-01T00:00:00' }));
    if (state === 'missing') coupons.data.delete('x');
    if (state === 'builder refusal') coupons.data.set('x', coupon('x', { exclude_sale_items: true }));
    await act(async () => { expect(await result.current.resume(saved.id)).toBeNull(); });
    if (state === 'valid') {
      expect(result.current.order.coupons).toEqual(saved.coupons);
      expect(result.current.order.totalMinor).toBe(saved.totalMinor);
      expect(result.current.error).toBeNull();
      await act(async () => { expect(await result.current.applyCoupon('x')).toBe('Coupon x is already applied'); });
      act(() => { expect(result.current.removeCoupon('x')).toBeNull(); });
      expect(result.current.order.coupons).toBeUndefined();
    } else {
      const reason = state === 'expired' ? 'Coupon x has expired' : state === 'missing' ? 'Coupon x does not exist' : 'Coupon x excludes sale items';
      expect(result.current.order.coupons).toBeUndefined();
      expect(result.current.error).toBe(`Coupon x was removed: ${reason}.`);
    }
    expect(await db.pos_drafts.findOne(saved.id).exec()).toBeNull();
    expect(coupons.find).toHaveBeenCalledTimes(2);
  });

  it('drops parked coupons with a message after the capability goes away', async () => {
    const coupons = source([coupon('x')]);
    const { result, rerender, options } = renderSale(coupons);
    add(result);
    await act(async () => { expect(await result.current.applyCoupon('x')).toBeNull(); });
    const id = result.current.order.id;
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    rerender({ ...options, capabilities: { orderCreate: 3, coupons: false } });
    await act(async () => { expect(await result.current.resume(id)).toBeNull(); });
    expect(result.current.order.coupons).toBeUndefined();
    expect(result.current.error).toBe(`Coupon x was removed: ${COUPONS_UNSUPPORTED}.`);
    expect(coupons.find).toHaveBeenCalledTimes(1);
    expect(coupons.productCategories).not.toHaveBeenCalled();
  });

  it('fetches restored product categories before reapplying a category coupon in a fresh hook', async () => {
    const coupons = source([coupon('category', { product_categories: [7] })]);
    const parked = renderSale(coupons);
    add(parked.result); add(parked.result, 1);
    await act(async () => { expect(await parked.result.current.applyCoupon('category')).toBeNull(); });
    const saved = parked.result.current.order;
    await act(async () => { expect(await parked.result.current.park()).toBeNull(); });
    parked.unmount();
    const { result } = renderSale(coupons);
    await act(async () => { expect(await result.current.resume(saved.id)).toBeNull(); });
    expect(coupons.productCategories).toHaveBeenCalledExactlyOnceWith([10, 20]);
    expect(result.current.order.coupons).toEqual(saved.coupons);
    expect(result.current.order.lineItems.map(({ netMinor }) => netMinor)).toEqual([900, 1000]);
    expect(result.current.error).toBeNull();
  });

  it('puts the price-change sentence before dropped coupon messages', async () => {
    const coupons = source([coupon('x'), coupon('y', { id: 102 })]);
    const { result } = renderSale(coupons, { currentPrice: () => 1500 });
    add(result);
    await act(async () => {
      expect(await result.current.applyCoupon('x')).toBeNull();
      expect(await result.current.applyCoupon('y')).toBeNull();
    });
    const id = result.current.order.id;
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    coupons.data.clear();
    await act(async () => { expect(await result.current.resume(id)).toBeNull(); });
    expect(result.current.error).toBe("Prices changed since this sale was parked: 1 line updated to today's price. Coupon x was removed: Coupon x does not exist. Coupon y was removed: Coupon y does not exist.");
    expect(result.current.order.lineItems[0].unitPriceMinor).toBe(1500);
  });

  it.each(['find', 'productCategories'] as const)('keeps the draft when the source rejects from %s during resume', async (method) => {
    const coupons = source();
    const { result } = renderSale(coupons);
    add(result);
    await act(async () => { expect(await result.current.applyCoupon('ten')).toBeNull(); });
    const id = result.current.order.id;
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    coupons[method].mockRejectedValueOnce(new Error('Source unavailable'));
    await act(async () => { await expect(result.current.resume(id)).rejects.toThrow('Source unavailable'); });
    expect(await db.pos_drafts.findOne(id).exec()).not.toBeNull();
    expect(result.current.order.lineItems).toEqual([]);
  });

  it('refuses a delayed coupon lookup after newSale replaces the builder', async () => {
    const coupons = source();
    let resolve!: (value: SaleCoupon) => void;
    coupons.find.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const { result } = renderSale(coupons);
    add(result);
    let applying!: Promise<string | null>;
    act(() => { applying = result.current.applyCoupon('ten'); });
    act(() => result.current.newSale());
    await act(async () => {
      resolve(coupon());
      expect(await applying).toBe('The sale changed while the coupon was being checked; apply it again');
    });
    expect(result.current.order.coupons).toBeUndefined();
    expect(result.current.order.lineItems).toEqual([]);
    add(result);
    await act(async () => { expect(await result.current.applyCoupon('ten')).toBeNull(); });
  });
});
