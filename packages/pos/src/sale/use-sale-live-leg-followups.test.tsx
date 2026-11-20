import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { wooProductTraits as traits } from '@tallyui/connector-woocommerce';
import type { TaxRounding } from '@tallyui/core';
import { orderDraftSchema, writeOrderDraft, type Order } from '../order';
import { PAYLOAD_STRING_MAX } from '../pos-order/command';
import { isLiveLeg } from '../order/order-builder';
import { posOrderCollection } from '../pos-order';
import { COUPONS_NEED_CONNECTION, COUPONS_UNSUPPORTED } from './discount-codes';
import { TaxProvider } from '../tax';
import { catalogueEntries } from './catalogue';
import { createStorePricedDiscountCodes, type StorePricedDiscountCodesOptions } from './store-priced-discount-codes';
import { COUPONS_REPRICING, SALE_FINISHED, SALE_HAS_PAYMENT, useSale } from './use-sale';

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
    await db.addCollections({ pos_drafts: { schema: orderDraftSchema }, pos_orders: posOrderCollection() });
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
  /** Parks the sale (coupon 'a', and a captured 500 cash leg when `paid`), runs `parked`, then resumes it: an unpaid draft's coupon is priced again at resume. */
  async function resumed(shop: ReturnType<typeof store>, paid: boolean, parked?: () => void) {
    const hook = renderSale({ discountCodes: shop.codes });
    await apply(hook.result, 'a');
    if (paid) act(() => { expect(hook.result.current.addTender({ method: 'cash', amountMinor: 500 })).toEqual(expect.any(String)); });
    const draftId = hook.result.current.order.id;
    await act(async () => { expect(await hook.result.current.park()).toBeNull(); });
    parked?.();
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

  // The parked draft: 1000 less coupon 'a' at 100, plus 20% VAT. At the store's new 300 it would be (1000 - 300) * 1.2 = 840.
  const PARKED_TOTAL = 1080, REPRICED_TOTAL = 840;

  it('T1 (RC1): a draft with a captured leg resumes with its parked coupon amounts, though the store price moved', async () => {
    const shop = store();
    let priced = 0, find: ReturnType<typeof vi.spyOn> | undefined;
    const { result } = await resumed(shop, true, () => { shop.perUnit.a = 300; priced = shop.price.mock.calls.length; find = vi.spyOn(shop.codes, 'find'); });
    expect(amounts(result)).toEqual([['a', 100]]);
    expect(result.current.order.totalMinor).toBe(PARKED_TOTAL);
    expect(result.current.order.paidMinor).toBe(500);
    expect(result.current.error).toBeNull();
    expect(result.current.order.couponPricesStale ?? false).toBe(false);
    expect(shop.price).toHaveBeenCalledTimes(priced);
    expect(find).toHaveBeenCalledTimes(0);
  });

  it('T2 (RC2): the same draft with no leg is priced again at resume', async () => {
    const shop = store();
    const { result } = await resumed(shop, false, () => { shop.perUnit.a = 300; });
    expect(amounts(result)).toEqual([['a', 300]]);
    expect(result.current.order.totalMinor).toBe(REPRICED_TOTAL);
  });

  it('T3 (RC3): once the captured leg is voided, the kept coupon is priced again once', async () => {
    const shop = store();
    const { result } = await resumed(shop, true, () => { shop.perUnit.a = 300; });
    const calls = shop.price.mock.calls.length, leg = result.current.order.payments[0].id;
    act(() => { expect(result.current.voidTender(leg)).toBe(true); });
    await settle();
    expect(amounts(result)).toEqual([['a', 300]]);
    expect(result.current.order.totalMinor).toBe(REPRICED_TOTAL);
    expect(shop.price).toHaveBeenCalledTimes(calls + 1);
    expect(result.current.couponsRepricing).toBe(false);
  });

  /** Voids the resumed draft's only leg and lets the effects run. */
  async function voidLeg(result: Sale) {
    const leg = result.current.order.payments[0].id;
    act(() => { expect(result.current.voidTender(leg)).toBe(true); });
    await settle();
  }

  it('T8: with the kept coupons and a live leg, startTender enters tender with no error; complete from the cart stores the parked coupons', async () => {
    const shop = store();
    const tender = await resumed(shop, true, () => { shop.perUnit.a = 300; });
    act(() => { tender.result.current.startTender('cash'); });
    expect(tender.result.current.stage.kind).toBe('tender');
    expect(tender.result.current.error).toBeNull();
    cleanup();

    const onSaleCompleted = async (order: unknown) => { await db.pos_orders.insert(order); };
    const hook = renderSale({ discountCodes: shop.codes, onSaleCompleted });
    shop.perUnit.a = 100;
    await apply(hook.result, 'a');
    act(() => { hook.result.current.addTender({ method: 'cash', amountMinor: 500 }); });
    const parked = hook.result.current.order;
    await act(async () => { expect(await hook.result.current.park()).toBeNull(); });
    shop.perUnit.a = 300;
    await act(async () => { expect(await hook.result.current.resume(parked.id)).toBeNull(); });
    await settle();
    const { result } = hook;
    act(() => { result.current.addTender({ method: 'cash', amountMinor: result.current.order.balanceDueMinor }); });
    await act(async () => { await result.current.complete(); });
    expect(result.current.error).toBeNull();
    expect(result.current.stage.kind).toBe('receipt');
    type Stored = { lines: { id: string }[]; coupons: NonNullable<Order['coupons']> };
    const [row] = (await db.pos_orders.find().exec()).map((doc) => doc.toJSON() as unknown as Stored);
    // finalize gives stored lines new ids; map each back to the parked line at its index.
    const lineIds = new Map(row.lines.map((line, i) => [line.id, parked.lineItems[i].id]));
    const stored = row.coupons.map((coupon) => ({ ...coupon, lines: coupon.lines?.map((line) => ({ ...line, lineId: lineIds.get(line.lineId) })) }));
    expect(stored).toEqual(parked.coupons);
  });

  it('T9: a reopened draft with only locked legs re-prices its coupons at resume (desk 2026-11-19)', async () => {
    const shop = store();
    const { result } = renderSale({ discountCodes: shop.codes });
    await apply(result, 'a');
    const sale = result.current.order;
    act(() => { result.current.newSale(); });
    await writeOrderDraft(db.pos_drafts, { ...sale, storeOrder: { id: '41', revision: 'r1' },
      payments: [{ id: 'p1', method: 'external', amountMinor: 500, reference: 'Cash', storePaymentId: 'p1', locked: true }] });
    shop.perUnit.a = 300;
    const calls = shop.price.mock.calls.length;
    await act(async () => { expect(await result.current.resume(sale.id)).toBeNull(); });
    await settle();
    expect(shop.price).toHaveBeenCalledTimes(calls + 1);
    expect(amounts(result)).toEqual([['a', 300]]);
  });

  it('T10: with no discount codes at resume the kept coupons stay; after the void they are removed as unsupported', async () => {
    const shop = store();
    const { result } = await resumed(shop, true, () => { shop.codes.supports = () => false; });
    expect(amounts(result)).toEqual([['a', 100]]);
    expect(result.current.order.totalMinor).toBe(PARKED_TOTAL);
    await voidLeg(result);
    expect(result.current.order.coupons).toBeUndefined();
    expect(result.current.error).toBe(COUPONS_UNSUPPORTED);
  });

  it('T11: after the void, a re-price stopped by a transient refusal holds removeCoupon and applyCoupon; Retry re-prices', async () => {
    const shop = store({ a: 100, b: 50 });
    const { result } = await resumed(shop, true, () => { shop.perUnit.a = 300; });
    const answer = shop.price.getMockImplementation()!;
    shop.price.mockRejectedValue(new Error('offline'));
    await voidLeg(result);
    expect(result.current.couponsRepricing).toBe(false);
    let removed: unknown, applied: unknown;
    act(() => { removed = result.current.removeCoupon('a'); });
    await act(async () => { applied = await result.current.applyCoupon('b'); });
    expect(removed).toBe(COUPONS_REPRICING);
    expect(applied).toBe(COUPONS_REPRICING);
    shop.price.mockImplementation(answer);
    await act(async () => { expect(await result.current.repriceCoupons()).toBeNull(); });
    expect(amounts(result)).toEqual([['a', 300]]);
    expect(result.current.order.totalMinor).toBe(REPRICED_TOTAL);
  });

  it('T14 (F1): a draft parked stale resumes stale with its parked total; complete is refused until the void re-prices once', async () => {
    const shop = store();
    const onSaleCompleted = vi.fn(async (order: unknown) => { await db.pos_orders.insert(order); });
    const { result } = renderSale({ discountCodes: shop.codes, onSaleCompleted });
    await apply(result, 'a');
    act(() => { expect(result.current.addTender({ method: 'cash', amountMinor: 500 })).toEqual(expect.any(String)); });
    act(() => { result.current.setCustomer(other); }); // the same rates: stale, figures kept (R1)
    await settle();
    expect(result.current.order.couponPricesStale).toBe(true);
    const parked = result.current.order;
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    shop.perUnit.a = 300;
    await act(async () => { expect(await result.current.resume(parked.id)).toBeNull(); });
    await settle();
    expect(result.current.order.couponPricesStale).toBe(true);
    expect(result.current.order.totalMinor).toBe(parked.totalMinor);
    act(() => { expect(result.current.addTender({ method: 'cash', amountMinor: result.current.order.balanceDueMinor })).toEqual(expect.any(String)); });
    await act(async () => { await result.current.complete(); });
    expect(result.current.error).toBe(COUPONS_REPRICING);
    expect(onSaleCompleted).not.toHaveBeenCalled();
    expect(await db.pos_orders.count().exec()).toBe(0);
    const calls = shop.price.mock.calls.length;
    for (const leg of result.current.order.payments.map((payment) => payment.id)) act(() => { expect(result.current.voidTender(leg)).toBe(true); });
    await settle();
    expect(shop.price).toHaveBeenCalledTimes(calls + 1);
    expect(amounts(result)).toEqual([['a', 300]]);
  });

  it('T15 (F2): a draft with a pending leg resumes with its parked prices and coupon figures, and completes with them', async () => {
    const shop = store();
    const catalogue: { price?: number } = {};
    const onSaleCompleted = async (order: unknown) => { await db.pos_orders.insert(order); };
    const { result } = renderSale({ discountCodes: shop.codes, onSaleCompleted, currentPrice: () => catalogue.price });
    await apply(result, 'a');
    let leg = '';
    act(() => { leg = result.current.addTender({ method: 'external', amountMinor: 500, status: 'pending' })!; });
    const parked = result.current.order;
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    catalogue.price = 1500;
    await act(async () => { expect(await result.current.resume(parked.id)).toBeNull(); });
    await settle();
    expect(result.current.order.totalMinor).toBe(PARKED_TOTAL);
    expect(result.current.order.coupons).toEqual(parked.coupons);
    expect(result.current.order.couponPricesStale ?? false).toBe(false);
    expect(result.current.order.lineItems[0].unitPriceMinor).toBe(parked.lineItems[0].unitPriceMinor);
    act(() => { expect(result.current.setTenderStatus(leg, 'captured')).toBe(true); });
    act(() => { result.current.addTender({ method: 'cash', amountMinor: result.current.order.balanceDueMinor }); });
    await act(async () => { await result.current.complete(); });
    expect(result.current.error).toBeNull();
    expect(result.current.stage.kind).toBe('receipt');
    type Stored = { lines: { id: string }[]; coupons: NonNullable<Order['coupons']> };
    const [row] = (await db.pos_orders.find().exec()).map((doc) => doc.toJSON() as unknown as Stored);
    const lineIds = new Map(row.lines.map((line, i) => [line.id, parked.lineItems[i].id]));
    const stored = row.coupons.map((coupon) => ({ ...coupon, lines: coupon.lines?.map((line) => ({ ...line, lineId: lineIds.get(line.lineId) })) }));
    expect(stored).toEqual(parked.coupons);
  });

  it('T15b (N2): a pending-leg draft keeps its parked rate when the class rate moves between park and resume', async () => {
    const shop = store(), state = { pct: 20 };
    function Wrapper({ children }: { children: ReactNode }) {
      const rated = { pricesIncludeTax: false, ratesPpm: { default: state.pct * 10000 },
        taxRates: { standard: [{ ...taxProps.taxRates.standard[0], rate: `${state.pct}.0000` }] } };
      return <TaxProvider {...rated} rounding={perOrder}>{children}</TaxProvider>;
    }
    const { result, rerender } = renderHook(() => useSale({ currency: 'GBP' }, {
      registerId: 'register-1', cashierRef: 'cashier@store.test',
      capabilities: { orderCreate: 6, coupons: true }, drafts: db.pos_drafts, discountCodes: shop.codes,
    }), { wrapper: Wrapper });
    act(() => { result.current.add(entries[0], traits); });
    await apply(result, 'a');
    act(() => { result.current.addTender({ method: 'external', amountMinor: 500, status: 'pending' }); });
    const parked = result.current.order;
    expect(parked.lineItems[0].taxFromClass).toBe(true);
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    state.pct = 10; rerender(); await settle();
    await act(async () => { expect(await result.current.resume(parked.id)).toBeNull(); });
    await settle();
    expect(result.current.order.totalMinor).toBe(PARKED_TOTAL);
    expect(result.current.order.coupons).toEqual(parked.coupons);
    expect(result.current.order.couponPricesStale ?? false).toBe(false);
  });

  it('T16 (F4, N3): park after a stopped re-price writes the kept coupons stale; resumed online, Retry parks the store figures', async () => {
    const shop = store();
    const { result } = await resumed(shop, true, () => { shop.perUnit.a = 300; });
    const find = vi.spyOn(shop.codes, 'find').mockResolvedValue({ refusal: COUPONS_NEED_CONNECTION, transient: true });
    await voidLeg(result);
    expect(find).toHaveBeenCalled();
    expect(result.current.couponsRepricing).toBe(false);
    const draftId = result.current.order.id;
    let parked: unknown;
    await act(async () => { parked = await result.current.park(); });
    expect(parked).toBeNull();
    expect(await db.pos_drafts.count().exec()).toBe(1);
    find.mockRestore();
    await act(async () => { expect(await result.current.resume(draftId)).toBeNull(); });
    await act(async () => { expect(await result.current.repriceCoupons()).toBeNull(); });
    expect(amounts(result)).toEqual([['a', 300]]);
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    const doc = await db.pos_drafts.findOne(draftId).exec();
    const saved = JSON.parse(doc!.toJSON().data) as Order;
    expect(saved.coupons?.map(({ code, discountMinor }) => [code, discountMinor])).toEqual([['a', 300]]);
  });

  it('T17 (F6): a captured draft with no display coupon rows takes the re-price path at resume', async () => {
    const shop = store();
    const { result } = renderSale({ discountCodes: shop.codes });
    await apply(result, 'a');
    act(() => { expect(result.current.addTender({ method: 'cash', amountMinor: 500 })).toEqual(expect.any(String)); });
    const sale = result.current.order;
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    const display = { ...sale.display };
    delete display.coupons;
    await writeOrderDraft(db.pos_drafts, { ...sale, display });
    const find = vi.spyOn(shop.codes, 'find');
    await act(async () => { expect(await result.current.resume(sale.id)).toBeNull(); });
    await settle();
    expect(find).toHaveBeenCalled();
    expect(amounts(result)).toEqual([['a', 100]]);
  });

  /** A captured draft (coupon a=100) resumed after the store moved to 300; then `find` goes offline and the leg is voided. */
  async function voidedOffline(onSaleCompleted?: SaleOptions['onSaleCompleted']) {
    const shop = store();
    const hook = renderSale({ discountCodes: shop.codes, ...(onSaleCompleted ? { onSaleCompleted } : {}) });
    await apply(hook.result, 'a');
    act(() => { expect(hook.result.current.addTender({ method: 'cash', amountMinor: 500 })).toEqual(expect.any(String)); });
    const parked = hook.result.current.order;
    await act(async () => { expect(await hook.result.current.park()).toBeNull(); });
    shop.perUnit.a = 300;
    await act(async () => { expect(await hook.result.current.resume(parked.id)).toBeNull(); });
    await settle();
    expect(amounts(hook.result)).toEqual([['a', 100]]);
    const find = vi.spyOn(shop.codes, 'find').mockResolvedValue({ refusal: COUPONS_NEED_CONNECTION, transient: true });
    await voidLeg(hook.result);
    expect(find).toHaveBeenCalled();
    return { ...hook, shop, find, parked };
  }

  it('T18 (N1): after the void, a new leg never brings the kept figures back; the sale stays stale and complete is refused', async () => {
    const onSaleCompleted = vi.fn(async (order: unknown) => { await db.pos_orders.insert(order); });
    const { result } = await voidedOffline(onSaleCompleted);
    act(() => { expect(result.current.addTender({ method: 'cash', amountMinor: 500 })).toEqual(expect.any(String)); });
    await settle();
    expect(result.current.order.couponPricesStale).toBe(true);
    act(() => { result.current.addTender({ method: 'cash', amountMinor: Math.max(1, result.current.order.balanceDueMinor) }); });
    await act(async () => { await result.current.complete(); });
    expect(result.current.error).toBe(COUPONS_REPRICING);
    expect(onSaleCompleted).not.toHaveBeenCalled();
    expect(await db.pos_orders.count().exec()).toBe(0);
  });

  it('T19 (N3): park after the void writes the kept coupons stale; resumed online with no live leg, they take the store price', async () => {
    const { result, find, parked } = await voidedOffline();
    let refusal: unknown;
    await act(async () => { refusal = await result.current.park(); });
    expect(refusal).toBeNull();
    const doc = await db.pos_drafts.findOne(parked.id).exec();
    const saved = JSON.parse(doc!.toJSON().data) as Order;
    expect(saved.coupons).toEqual(parked.coupons);
    expect(saved.couponPricesStale).toBe(true);
    find.mockRestore();
    await act(async () => { expect(await result.current.resume(parked.id)).toBeNull(); });
    await settle();
    expect(result.current.order.payments.some(isLiveLeg)).toBe(false);
    expect(amounts(result)).toEqual([['a', 300]]);
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
