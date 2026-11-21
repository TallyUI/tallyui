import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { createOrderBuilder, orderDraftSchema, writeOrderDraft, type Order } from '../order';
import { couponPricingBasis } from '../order/order-builder';
import { posOrderCollection, type PosOrder } from '../pos-order';
import { toOrderCreateEnvelope } from '../pos-order/command';
import { createTaxContext, TaxProvider } from '../tax';
import { createStorePricedDiscountCodes } from './store-priced-discount-codes';
import { COUPON_CARRIED, COUPON_CARRY_STALE, useSale } from './use-sale';

const currency = 'EUR', code = 'refused-save';
const taxProps = { pricesIncludeTax: true, ratesPpm: { default: 190000 } };
const taxContext = createTaxContext(taxProps);
type SaleOptions = NonNullable<Parameters<typeof useSale>[1]>;
function draft(options: { taxClass?: string; unpaid?: boolean } = {}): Order {
  const builder = createOrderBuilder({ currency, taxContext });
  const first = builder.addLine({ productId: 'p1', variantId: 'v1', name: 'Inclusive', taxClass: options.taxClass,
    unitPrice: { amount: 1190, currency, taxInclusive: true } });
  const second = builder.addLine({ productId: 'p2', name: 'Exclusive',
    unitPrice: { amount: 500, currency, taxInclusive: false } });
  builder.setCoupons([code], { kind: 'store-priced', carried: true, basis: couponPricingBasis(builder.getSnapshot()),
    priced: new Map([[code, { couponId: 'promo_1', lines: [{ lineId: first, amountMinor: 100 }, { lineId: second, amountMinor: 50 }] }]]) });
  if (!options.unpaid) builder.addPayment({ method: 'cash', status: 'captured', amountMinor: builder.getSnapshot().totalMinor });
  return builder.getSnapshot();
}
const figures = ({ subtotalMinor, discountMinor, taxMinor, totalMinor, display, coupons }: Order) =>
  ({ subtotalMinor, discountMinor, taxMinor, totalMinor, display, coupons });

describe('useSale carried coupons', () => {
  let db: RxDatabase;
  beforeEach(async () => {
    db = await createRxDatabase({ name: `salecarried${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    await db.addCollections({ pos_drafts: { schema: orderDraftSchema }, pos_orders: posOrderCollection() });
  });
  afterEach(async () => { cleanup(); await db.remove(); });

  async function resume(saved = draft(), overrides: Partial<SaleOptions> = {}) {
    await writeOrderDraft(db.pos_drafts, saved);
    const price = vi.fn(async () => ({ priced: new Map() }));
    const discountCodes = { ...createStorePricedDiscountCodes({ price }), beforeResume: vi.fn(async () => {}) };
    const find = vi.spyOn(discountCodes, 'find'), apply = vi.spyOn(discountCodes, 'apply');
    const onSaleCompleted = vi.fn(async (order: PosOrder) => { await db.pos_orders.insert(order); });
    function Wrapper({ children }: { children: ReactNode }) {
      return <TaxProvider {...taxProps}>{children}</TaxProvider>;
    }
    const hook = renderHook(() => useSale({ currency }, { registerId: 'register-1', cashierRef: 'cashier@store.test',
      capabilities: { orderCreate: 12, coupons: true }, drafts: db.pos_drafts, discountCodes, onSaleCompleted, ...overrides }), { wrapper: Wrapper });
    await act(async () => { expect(await hook.result.current.resume(saved.id)).toBeNull(); });
    return { ...hook, saved, find, apply, price, beforeResume: discountCodes.beforeResume, onSaleCompleted };
  }

  it('U1: resumes and completes a carried draft without looking up or sending its code', async () => {
    const { result, saved, find, apply, price, beforeResume, onSaleCompleted } = await resume();
    expect(result.current.order.totalMinor).toBe(saved.totalMinor);
    expect(result.current.order.couponPricesStale).toBeUndefined();
    expect(result.current.error).toBeNull();
    await act(async () => { await result.current.complete(); });
    expect(result.current.error).toBeNull();
    expect(result.current.stage.kind).toBe('receipt');
    expect(onSaleCompleted).toHaveBeenCalledTimes(1);
    const stored = (await db.pos_orders.find().exec())[0].toJSON() as PosOrder;
    expect(stored.coupons?.[0].carried).toBe(true);
    expect(stored.totalMinor).toBe(saved.totalMinor);
    expect(JSON.stringify(toOrderCreateEnvelope(stored, 'device', 1, { maxVersion: 12 }).payload)).not.toContain(code);
    expect(find).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    expect(price).not.toHaveBeenCalled();
    expect(beforeResume).not.toHaveBeenCalled();
  });

  it('U2: parks and resumes the carried figures and priced line amounts again', async () => {
    const { result, saved, find } = await resume();
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    const parked: Order = JSON.parse((await db.pos_drafts.findOne(saved.id).exec())!.toJSON().data);
    expect(figures(parked)).toEqual(figures(saved));
    await act(async () => { expect(await result.current.resume(saved.id)).toBeNull(); });
    expect(figures(result.current.order)).toEqual(figures(saved));
    expect(result.current.order.couponPricesStale).toBeUndefined();
    expect(result.current.error).toBeNull();
    expect(find).not.toHaveBeenCalled();
  });

  it('U3: refuses adding and removing coupons once the cash leg is voided', async () => {
    const { result, saved, find, apply } = await resume();
    act(() => { expect(result.current.voidTender(saved.payments[0].id)).toBe(true); });
    await act(async () => { expect(await result.current.applyCoupon('other')).toBe(COUPON_CARRIED); });
    act(() => { expect(result.current.removeCoupon(code)).toBe(COUPON_CARRIED); });
    expect(result.current.order.coupons).toEqual(saved.coupons);
    expect(find).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it.each([false, true])('U4: a parked stale carried sale refuses tender and complete (gate: %s)', async (withGate) => {
    const saved = { ...draft(), couponPricesStale: true as const };
    const tenderGate = vi.fn(async () => null);
    const { result, onSaleCompleted } = await resume(saved, withGate ? { tenderGate } : {});
    expect(result.current.order.couponPricesStale).toBe(true);
    await act(async () => { await result.current.startTender('cash'); });
    expect(result.current.error).toBe(COUPON_CARRY_STALE);
    expect(result.current.stage).toEqual({ kind: 'cart' });
    expect(tenderGate).not.toHaveBeenCalled();
    await act(async () => { await result.current.complete(); });
    expect(result.current.error).toBe(COUPON_CARRY_STALE);
    expect(result.current.saving).toBe(false);
    expect(onSaleCompleted).not.toHaveBeenCalled();
    expect(await db.pos_orders.find().exec()).toHaveLength(0);
  });

  it('U6: an unpaid carried draft becomes stale only when the resumed tax rate changes', async () => {
    const saved = draft({ taxClass: 'standard', unpaid: true });
    expect(saved.payments).toEqual([]);
    expect(saved.lineItems[0].taxFromClass).toBe(true);
    expect(saved.lineItems[0].taxLines[0].ratePpm).toBe(190000);
    for (const ratePpm of [190000, 200000]) {
      const { result, unmount } = await resume(saved, {
        taxContextFor: () => ({ taxContext: createTaxContext({ ...taxProps, ratesPpm: { default: 190000, standard: ratePpm } }),
          location: { taxBasedOn: 'base', addressUsed: 'base', location: { country: 'DE', state: '', city: '', postcode: '' } } }),
      });
      expect(result.current.order.lineItems[0].taxLines[0].ratePpm).toBe(ratePpm);
      expect(result.current.order.couponPricesStale).toBe(ratePpm === 200000 ? true : undefined);
      if (ratePpm === 200000) {
        await act(async () => { await result.current.startTender('cash'); });
        expect(result.current.error).toBe(COUPON_CARRY_STALE);
      }
      unmount();
    }
  });

  it('retax keeps carried coupons and marks them stale even when the new context has the same rates', async () => {
    const nextTax = createTaxContext(taxProps);
    const { result, saved, find, price } = await resume(draft(), {
      taxContextFor: (customer) => ({ taxContext: customer ? nextTax : taxContext,
        location: { taxBasedOn: 'base', addressUsed: 'base', location: { country: 'DE', state: '', city: '', postcode: '' } } }),
    });
    act(() => { expect(result.current.voidTender(saved.payments[0].id)).toBe(true); });
    act(() => { result.current.setCustomer({ id: 'customer-2', name: 'Ada' }); });
    expect(result.current.order.customer?.id).toBe('customer-2');
    expect(result.current.order.coupons).toEqual(saved.coupons);
    expect(result.current.order.couponPricesStale).toBe(true);
    await act(async () => { await result.current.startTender('cash'); });
    expect(result.current.error).toBe(COUPON_CARRY_STALE);
    expect(find).not.toHaveBeenCalled();
    expect(price).not.toHaveBeenCalled();
  });
});
