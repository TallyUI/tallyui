import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { wooProductTraits as traits } from '@tallyui/connector-woocommerce';
import type { TaxRounding } from '@tallyui/core';
import { orderDraftSchema } from '../order';
import { PAYLOAD_STRING_MAX } from '../pos-order/command';
import { TaxProvider } from '../tax';
import { catalogueEntries } from './catalogue';
import { createStorePricedDiscountCodes, type StorePricedDiscountCodesOptions } from './store-priced-discount-codes';
import { SALE_FINISHED, SALE_HAS_PAYMENT, useSale } from './use-sale';

const entries = catalogueEntries([
  { id: 10, name: 'Shirt', price: '10.00', categories: [{ id: 7, name: 'Clothes' }] },
], traits, { currency: 'GBP' });
const perOrder: TaxRounding = { granularity: 'per_order', mode: 'half_away_from_zero' };
const taxProps = { pricesIncludeTax: false, ratesPpm: { default: 200000 }, taxRates: { standard: [
  { id: 1, code: 'rate-1', label: 'VAT', rate: '20.0000', priority: 1, compound: false, shipping: true },
] } };
type Price = StorePricedDiscountCodesOptions['price'];
type SaleOptions = Parameters<typeof useSale>[1];
type Sale = { current: ReturnType<typeof useSale> };

/** A scripted store: each code takes `perUnit[code]` off per unit of the first line, read at each call. */
function store(perUnit: Record<string, number> = { a: 100 }) {
  const price = vi.fn<Price>(async (codes, sale) => {
    const line = sale.order.lineItems[0];
    return { priced: new Map(codes.map((code) => [code, { couponId: `id-${code}`, lines: [{ lineId: line.id, amountMinor: perUnit[code] * line.quantity }] }])) };
  });
  return { perUnit, price, codes: createStorePricedDiscountCodes({ price }) };
}
const settle = () => act(async () => { for (let k = 0; k < 4; k++) await new Promise((resolve) => setTimeout(resolve, 0)); });
const amounts = (result: Sale) => result.current.order.coupons?.map(({ code, discountMinor }) => [code, discountMinor]);
const other = { id: 'customer-2', name: 'Ada' };

describe('useSale live-leg follow-ups (#1059 review)', () => {
  let db: RxDatabase;
  beforeEach(async () => {
    db = await createRxDatabase({ name: `saleliveleg${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    await db.addCollections({ pos_drafts: { schema: orderDraftSchema } });
  });
  afterEach(async () => { cleanup(); await db.remove(); });

  function renderSale(overrides: Partial<SaleOptions> = {}) {
    function Wrapper({ children }: { children: ReactNode }) {
      return <TaxProvider {...taxProps} rounding={perOrder}>{children}</TaxProvider>;
    }
    const hook = renderHook(() => useSale({ currency: 'GBP' }, {
      registerId: 'register-1', cashierRef: 'cashier@store.test',
      capabilities: { orderCreate: 6, coupons: true }, drafts: db.pos_drafts, ...overrides,
    }), { wrapper: Wrapper });
    act(() => { hook.result.current.add(entries[0], traits); });
    return hook;
  }
  async function apply(result: Sale, code: string) {
    await act(async () => { expect(await result.current.applyCoupon(code)).toBeNull(); });
  }
  /** Parks the sale (coupon 'a', and a captured 500 cash leg when `paid`), then resumes it: the coupon is priced again at resume. */
  async function resumed(shop: ReturnType<typeof store>, paid: boolean) {
    const hook = renderSale({ discountCodes: shop.codes });
    await apply(hook.result, 'a');
    if (paid) act(() => { expect(hook.result.current.addTender({ method: 'cash', amountMinor: 500 })).toEqual(expect.any(String)); });
    const draftId = hook.result.current.order.id;
    await act(async () => { expect(await hook.result.current.park()).toBeNull(); });
    await act(async () => { expect(await hook.result.current.resume(draftId)).toBeNull(); });
    await settle();
    expect(hook.result.current.order.id).toBe(draftId);
    expect(hook.result.current.order).not.toHaveProperty('couponPricesStale');
    expect(hook.result.current.order.payments).toEqual(paid ? [expect.objectContaining({ method: 'cash', amountMinor: 500 })] : []);
    return hook;
  }

  it('R1: a resumed draft with a captured leg and stale store-priced coupons does not re-price; the total is unchanged', async () => {
    const shop = store();
    const { result } = await resumed(shop, true);
    expect(amounts(result)).toEqual([['a', 100]]);
    const total = result.current.order.totalMinor, calls = shop.price.mock.calls.length;
    shop.perUnit.a = 300; // the store's price for 'a' has moved since the resume priced it
    // setCustomer is not a line change, so the captured leg does not refuse it; the customer is in the pricing basis.
    act(() => { result.current.setCustomer(other); });
    await settle();
    expect(result.current.order.totalMinor).toBe(total);
    expect(amounts(result)).toEqual([['a', 100]]);
    expect(shop.price).toHaveBeenCalledTimes(calls);
    expect(result.current.order.couponPricesStale).toBe(true);
    expect(result.current.couponsRepricing).toBe(false);
  });

  it('R2: repriceCoupons() with a captured leg returns SALE_HAS_PAYMENT and calls the coupon finder zero times', async () => {
    const shop = store();
    const { result } = await resumed(shop, true);
    const find = vi.spyOn(shop.codes, 'find');
    const total = result.current.order.totalMinor;
    shop.perUnit.a = 300;
    let returned: unknown;
    await act(async () => { returned = await result.current.repriceCoupons(); });
    await settle();
    expect(returned).toBe(SALE_HAS_PAYMENT);
    expect(result.current.error).toBe(SALE_HAS_PAYMENT);
    expect(find).not.toHaveBeenCalled();
    expect(result.current.couponsRepricing).toBe(false);
    expect(result.current.order.totalMinor).toBe(total);
  });

  it('R3: with no live leg the stale coupons re-price as before', async () => {
    const shop = store();
    const { result } = await resumed(shop, false);
    const total = result.current.order.totalMinor, calls = shop.price.mock.calls.length;
    shop.perUnit.a = 300;
    act(() => { result.current.setCustomer(other); });
    await settle();
    expect(shop.price).toHaveBeenCalledTimes(calls + 1);
    expect(result.current.order).not.toHaveProperty('couponPricesStale');
    expect(amounts(result)).toEqual([['a', 300]]);
    expect(result.current.order.totalMinor).toBeLessThan(total);
    await act(async () => { expect(await result.current.repriceCoupons()).toBeNull(); });
    expect(shop.price).toHaveBeenCalledTimes(calls + 2);
  });

  /** A one-line sale paid by a captured cash leg and completed: the receipt stage, with the finished builder still live. */
  async function saleOnReceipt() {
    const onSaleCompleted = vi.fn();
    const hook = renderSale({ onSaleCompleted });
    let leg = '';
    act(() => { leg = hook.result.current.addTender({ method: 'cash', amountMinor: hook.result.current.order.totalMinor, status: 'captured' })!; });
    await act(async () => { await hook.result.current.complete(); });
    expect(hook.result.current.stage.kind).toBe('receipt');
    expect(onSaleCompleted).toHaveBeenCalledTimes(1);
    return { ...hook, leg };
  }

  it('R4: on the receipt voidTender returns false, the leg stays captured, error is SALE_FINISHED', async () => {
    const { result, leg } = await saleOnReceipt();
    let voided: unknown;
    act(() => { voided = result.current.voidTender(leg); });
    expect(voided).toBe(false);
    expect(result.current.order.payments).toEqual([expect.objectContaining({ id: leg, status: 'captured' })]);
    expect(result.current.error).toBe(SALE_FINISHED);
    expect(result.current.stage.kind).toBe('receipt');
  });

  it('R5: on the receipt removeTender leaves the leg, error is SALE_FINISHED', async () => {
    const { result, leg } = await saleOnReceipt();
    act(() => { result.current.removeTender(leg); });
    expect(result.current.order.payments).toEqual([expect.objectContaining({ id: leg, status: 'captured' })]);
    expect(result.current.error).toBe(SALE_FINISHED);
    expect(result.current.stage.kind).toBe('receipt');
  });

  it('R6: SALE_HAS_PAYMENT names Cancel the payment', () => {
    expect(SALE_HAS_PAYMENT).toBe('A payment was taken on this sale. Cancel the payment before changing the sale.');
  });

  it('R7: a SALE_HAS_PAYMENT error is cleared when the sale reaches the receipt', async () => {
    const { result } = renderSale({ onSaleCompleted: vi.fn() });
    act(() => { result.current.addTender({ method: 'cash', amountMinor: result.current.order.totalMinor }); });
    act(() => { result.current.setQuantity(result.current.order.lineItems[0].id, 2); });
    expect(result.current.error).toBe(SALE_HAS_PAYMENT);
    await act(async () => { await result.current.complete(); });
    expect(result.current.stage.kind).toBe('receipt');
    expect(result.current.error).toBeNull();
  });

  it('R8: setTenderStatus failed on the only live leg clears SALE_HAS_PAYMENT; another error stays', () => {
    const { result } = renderSale();
    const line = result.current.order.lineItems[0].id;
    let first = '', second = '';
    act(() => { first = result.current.addTender({ method: 'external', amountMinor: 500, status: 'pending' })!; });
    act(() => { second = result.current.addTender({ method: 'external', amountMinor: 500, status: 'pending' })!; });
    act(() => { result.current.setQuantity(line, 2); });
    expect(result.current.error).toBe(SALE_HAS_PAYMENT);
    act(() => { expect(result.current.setTenderStatus(first, 'failed')).toBe(true); });
    expect(result.current.error).toBe(SALE_HAS_PAYMENT); // the second leg is still in motion
    act(() => { expect(result.current.setTenderStatus(second, 'failed')).toBe(true); });
    expect(result.current.error).toBeNull();

    // Another error stays: a dropped terminal reference on a new pending leg, then that leg fails.
    let third = '';
    act(() => { third = result.current.addTender({ method: 'external', amountMinor: 500, status: 'pending', reference: 'x'.repeat(PAYLOAD_STRING_MAX + 1) })!; });
    const dropped = result.current.error;
    expect(dropped).toMatch(/payment reference couldn't be kept/);
    act(() => { expect(result.current.setTenderStatus(third, 'failed')).toBe(true); });
    expect(result.current.error).toBe(dropped);
    expect(result.current.order.lineItems[0].quantity).toBe(1);
  });
});
