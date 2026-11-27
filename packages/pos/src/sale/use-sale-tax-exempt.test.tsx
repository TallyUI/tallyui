import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { StoreSettings, woocommerceTax } from '@tallyui/core';
import { wooProductTraits as traits } from '@tallyui/connector-woocommerce';
import { couponPricingBasis, createOrderBuilder, orderDraftSchema, writeOrderDraft, type Order } from '../order';
import { patchSale } from '../order/tax-exempt';
import { taxProviderProps } from '../store-settings';
import { saleTaxContexts, TaxProvider } from '../tax';
import { catalogueEntries } from './catalogue';
import { COUPONS_NEED_CONNECTION } from './discount-codes';
import { PAYMENT_IN_MOTION, SALE_FINISHED, TAX_EXEMPT_LOCKED, TAX_EXEMPT_PAYMENT_TAKEN, TAX_EXEMPT_REMOVED, TAX_EXEMPT_UNAVAILABLE, useSale } from './use-sale';
import { createDiscountCodes } from './woocommerce/discount-codes';

const entries = catalogueEntries([{ id: 10, name: 'Shirt', price: '10.00' }], traits, { currency: 'AUD' });
const wooRate = (id: number, country: string, rate: string): woocommerceTax.WooTaxRate => ({
  id, country, state: '', postcode: '', city: '', postcodes: [], cities: [], rate, name: 'GST',
  priority: 1, compound: false, shipping: true, order: id, class: 'standard',
});
const settings: StoreSettings = {
  currency: 'AUD', pricesIncludeTax: false, taxRatesPpm: { default: 100000 },
  taxRates: { standard: [{ id: 1, code: 'AU-GST-1', label: 'GST', rate: '10.0000', priority: 1, compound: false, shipping: true }] },
  taxRounding: { granularity: 'woocommerce', roundAtSubtotal: false }, taxClassSlugs: ['standard'], shippingTaxClass: 'inherit',
  taxBasedOn: 'shipping', baseTaxAddress: { country: 'AU', state: 'NSW', city: 'Sydney', postcode: '2000' },
  taxRateTable: [wooRate(1, 'AU', '10.0000'), wooRate(2, 'NZ', '15.0000')],
};
type Sale = { current: ReturnType<typeof useSale> };
type SaleOptions = Parameters<typeof useSale>[1];
let db: RxDatabase;
beforeEach(async () => {
  db = await createRxDatabase({ name: `saleexempt${Math.random().toString(36).slice(2)}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  await db.addCollections({ pos_drafts: { schema: orderDraftSchema } });
});
afterEach(async () => { cleanup(); await db.remove(); });

function renderSale(overrides: Partial<SaleOptions> = {}, pricing = settings) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <TaxProvider {...taxProviderProps(pricing)}>{children}</TaxProvider>;
  }
  const options: SaleOptions = { registerId: 'register-1', cashierRef: 'cashier@store.test', drafts: db.pos_drafts,
    capabilities: { orderCreate: 12, taxExempt: true, coupons: true }, taxContextFor: saleTaxContexts(pricing, { orderCreateVersion: 8 }), ...overrides };
  return { ...renderHook((opts: SaleOptions) => useSale(pricing, opts), { wrapper: Wrapper, initialProps: options }), options };
}
function add(result: Sale, charges = false) {
  act(() => {
    result.current.add(entries[0], traits);
    if (charges) {
      result.current.addFee({ name: 'Bag', amountMinor: 200 });
      result.current.addShipping({ name: 'Post', amountMinor: 103 });
    }
  });
}
function toggle(result: Sale, on: boolean, accepted = true) {
  act(() => { expect(result.current.setTaxExempt(on)).toBe(accepted); });
}
function takeCash(result: Sale, amountMinor: number) {
  act(() => { expect(result.current.addTender({ method: 'cash', amountMinor })).not.toBeNull(); });
}
function money(order: Order) {
  return JSON.parse(JSON.stringify(order, (key, value) => ['id', 'lineId', 'discountId', 'createdAt', 'updatedAt'].includes(key) ? undefined : value));
}

it('S1 exempts every line and charge', () => {
  const { result } = renderSale();
  add(result, true);
  expect(result.current.taxExemptAvailable).toBe(true);
  toggle(result, true);
  expect(result.current.taxExempt).toBe(true);
  const { order } = result.current;
  expect(order.taxMinor).toBe(0);
  expect(order.totalMinor).toBe(1000 + 200 + 103);
  expect([...order.lineItems, ...order.fees!, ...order.shipping!].map(row => row.taxMicros)).toEqual(['0', '0', '0']);
});

it('S2 turning exemption off restores the never-exempt cart, including charges', () => {
  const { result } = renderSale(), plain = renderSale().result;
  add(result, true); add(plain, true);
  toggle(result, true); toggle(result, false);
  expect(result.current.taxExempt).toBe(false);
  expect(money(result.current.order)).toEqual(money(plain.current.order));
});

it('S3 refuses exemption without the capability and leaves the order alone', () => {
  const { result } = renderSale({ capabilities: { orderCreate: 12 } });
  add(result);
  const before = result.current.order;
  expect(result.current.taxExemptAvailable).toBe(false);
  toggle(result, true, false);
  expect(result.current.error).toBe(TAX_EXEMPT_UNAVAILABLE);
  expect(result.current.order).toBe(before);
});

it('S4 refuses exemption on a prices-include-tax store', () => {
  const { result } = renderSale({}, { ...settings, pricesIncludeTax: true });
  add(result);
  expect(result.current.taxExemptAvailable).toBe(false);
  toggle(result, true, false);
  expect(result.current.error).toBe(TAX_EXEMPT_UNAVAILABLE);
});

it('S5 captured cash prevents turning exemption on', () => {
  const { result } = renderSale();
  add(result); takeCash(result, 500);
  const total = result.current.order.totalMinor;
  toggle(result, true, false);
  expect(result.current.error).toBe(TAX_EXEMPT_PAYMENT_TAKEN);
  expect(result.current.order.totalMinor).toBe(total);
});

it('S6 turning exemption off after a cash leg raises the due and keeps the tender open', async () => {
  const { result } = renderSale();
  add(result, true);
  const { totalMinor, taxMinor } = result.current.order;
  toggle(result, true);
  act(() => result.current.startTender('cash'));
  takeCash(result, 500);
  const due = result.current.order.balanceDueMinor;
  toggle(result, false);
  expect(result.current.order.balanceDueMinor).toBe(totalMinor - 500);
  expect(result.current.order.balanceDueMinor - due).toBe(taxMinor);
  await act(() => result.current.complete());
  expect(result.current.error).toBe('finalize: underpaid');
  expect(result.current.stage).toEqual({ kind: 'tender', method: 'cash' });
});

it('S7 a card leg in motion prevents turning exemption off', () => {
  const { result } = renderSale();
  add(result); toggle(result, true);
  act(() => { expect(result.current.addTender({ method: 'external', amountMinor: 500, status: 'pending' })).not.toBeNull(); });
  toggle(result, false, false);
  expect(result.current.error).toBe(PAYMENT_IN_MOTION);
  expect(result.current.taxExempt).toBe(true);
});

it('S8 refuses changes on the receipt', async () => {
  const { result } = renderSale();
  add(result); toggle(result, true); takeCash(result, 1000);
  await act(() => result.current.complete());
  expect(result.current.stage.kind).toBe('receipt');
  toggle(result, false, false);
  expect(result.current.error).toBe(SALE_FINISHED);
});

it('S9 a new sale does not inherit exemption', () => {
  const { result } = renderSale();
  add(result); toggle(result, true);
  act(() => result.current.newSale());
  expect(result.current.taxExempt).toBe(false);
});

it.each([['S10', true], ['S11', false]] as const)('%s resumes a partly paid exempt sale with capability = %s', async (_, available) => {
  const { result, rerender, options } = renderSale(), plain = renderSale().result;
  add(plain, true); takeCash(plain, 300);
  const controlId = plain.current.order.id;
  await act(async () => { expect(await plain.current.park()).toBeNull(); });
  await act(async () => { expect(await plain.current.resume(controlId)).toBeNull(); });
  add(result, true); toggle(result, true); takeCash(result, 300);
  const parked = result.current.order;
  await act(async () => { expect(await result.current.park()).toBeNull(); });
  if (!available) rerender({ ...options, capabilities: { orderCreate: 12 } });
  await act(async () => { expect(await result.current.resume(parked.id)).toBeNull(); });
  expect(result.current.order.payments).toEqual(parked.payments);
  expect(result.current.taxExempt).toBe(available);
  if (available) {
    expect(result.current.order.totalMinor).toBe(parked.totalMinor);
    toggle(result, false);
  } else expect(result.current.error).toContain(TAX_EXEMPT_REMOVED);
  expect(result.current.order.totalMinor).toBe(plain.current.order.totalMinor);
});

it('S12 a new customer re-taxes the twin at the NZ rate', () => {
  const { result } = renderSale();
  act(() => result.current.setCustomer({ id: '9', name: 'Matt', shipping: { country: 'AU' } }));
  add(result);
  expect(result.current.order.taxMinor).toBe(100);
  toggle(result, true);
  act(() => result.current.setCustomer({ id: '10', name: 'Ann', shipping: { country: 'NZ' } }));
  expect(result.current.taxExempt).toBe(true);
  expect(result.current.order.taxMinor).toBe(0);
  expect(result.current.order.exemptedFrom?.customer?.id).toBe('10');
  toggle(result, false);
  expect(result.current.order.taxMinor).toBe(150);
});

it('S13 Woo prices the code against the taxed twin and only hides its tax while exempt', async () => {
  const discountCodes = createDiscountCodes({ find: async code => ({ id: 101, code, discount_type: 'percent', amount: '10' }),
    productCategories: async () => new Map() });
  const apply = vi.spyOn(discountCodes, 'apply');
  const { result } = renderSale({ discountCodes }), plain = renderSale({ discountCodes }).result;
  add(result); add(plain); toggle(result, true);
  const twin = result.current.order.exemptedFrom;
  await act(async () => { expect(await result.current.applyCoupon('ten')).toBeNull(); });
  expect(apply.mock.calls[0][1].order).toBe(twin);
  expect(result.current.order.coupons?.map(coupon => coupon.discountTaxMinor)).toEqual([0]);
  await act(async () => { expect(await plain.current.applyCoupon('ten')).toBeNull(); });
  toggle(result, false);
  expect(result.current.order.coupons?.[0].discountTaxMinor).toBe(10);
  expect(money(result.current.order)).toEqual(money(plain.current.order));
});

it('S14 a reopened store order cannot take exemption', () => {
  const { result, options } = renderSale();
  const builder = createOrderBuilder({ currency: 'AUD', taxContext: options.taxContextFor!(null).taxContext, storeOrder: { id: '41', revision: '1' } });
  builder.addLine({ productId: '10', name: 'Shirt', storeLineId: '7', unitPrice: { amount: 1000, currency: 'AUD' } });
  act(() => { expect(result.current.openStoreOrder(builder.getSnapshot())).toBeNull(); });
  expect(result.current.taxExemptAvailable).toBe(false);
  toggle(result, true, false);
  expect(result.current.error).toBe(TAX_EXEMPT_UNAVAILABLE);
});

it('S15 patchSale patches both views without creating a twin on a plain sale', () => {
  const builder = createOrderBuilder({ currency: 'AUD', taxContext: saleTaxContexts(settings)(null).taxContext });
  const patch = { couponPricesStale: true } as const;
  const plain = patchSale(builder.getSnapshot(), patch);
  expect(plain).toMatchObject(patch);
  expect(plain).not.toHaveProperty('exemptedFrom');
  builder.setTaxExempt(true);
  expect(patchSale(builder.getSnapshot(), patch)).toMatchObject({ ...patch, exemptedFrom: patch });
});

it('S16 refuses exemption on an after-close sale with no payment', async () => {
  const { result, options } = renderSale();
  const builder = createOrderBuilder({ currency: 'AUD', taxContext: options.taxContextFor!(null).taxContext,
    afterClose: { sessionId: 'closed-session', createdAt: '2026-11-20T09:00:00.000Z', registerId: 'register-0', payments: [], taxMinor: 0, fees: [], shipping: [] } });
  builder.addLine({ productId: 'gift', variantId: 'free', name: 'Gift', unitPrice: { amount: 0, currency: 'AUD' } });
  await writeOrderDraft(db.pos_drafts, builder.getSnapshot());
  await act(async () => { expect(await result.current.resume(builder.getSnapshot().id)).toBeNull(); });
  toggle(result, true, false);
  expect(result.current.error).toBe(TAX_EXEMPT_LOCKED);
  expect(result.current.taxExempt).toBe(false);
});

it('S17 refuses exemption when an unpaid sale carries a coupon', async () => {
  const { result, options } = renderSale();
  const builder = createOrderBuilder({ currency: 'AUD', taxContext: options.taxContextFor!(null).taxContext });
  const lineId = builder.addLine({ productId: '10', name: 'Shirt', unitPrice: { amount: 1000, currency: 'AUD' } });
  const code = 'refused-save';
  builder.setCoupons([code], { kind: 'store-priced', carried: true, basis: couponPricingBasis(builder.getSnapshot()),
    priced: new Map([[code, { couponId: 'promo_1', lines: [{ lineId, amountMinor: 100 }] }]]) });
  await writeOrderDraft(db.pos_drafts, builder.getSnapshot());
  await act(async () => { expect(await result.current.resume(builder.getSnapshot().id)).toBeNull(); });
  toggle(result, true, false);
  expect(result.current.error).toBe(TAX_EXEMPT_LOCKED);
});

it('S18 puts the exempt draft back unchanged when a resume without the capability is interrupted', async () => {
  const { result, rerender, options } = renderSale();
  add(result); toggle(result, true);
  const before = result.current.order;
  await act(async () => { expect(await result.current.park()).toBeNull(); });
  rerender({ ...options, capabilities: { orderCreate: 12, coupons: true } });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const findOne = db.pos_drafts.findOne.bind(db.pos_drafts);
  vi.spyOn(db.pos_drafts, 'findOne').mockImplementationOnce(((id: string) => {
    const query = findOne(id);
    const exec = query.exec.bind(query);
    query.exec = (async () => { await gate; return exec(); }) as typeof query.exec;
    return query;
  }) as typeof findOne);
  let resuming!: Promise<string | null>;
  act(() => { resuming = result.current.resume(before.id); });
  add(result);
  await act(async () => {
    release();
    expect(await resuming).toBe('The sale changed while it was being resumed; resume it again');
  });
  const draft = await db.pos_drafts.findOne(before.id).exec();
  expect(JSON.parse(draft!.toJSON().data)).toMatchObject({ taxExempt: true, exemptedFrom: expect.any(Object) });
  expect(JSON.parse(draft!.toJSON().data)).toEqual(JSON.parse(JSON.stringify(before)));
});

it('S19 restores the same coupon and order tax after a stale park as a never-exempt sale', async () => {
  const discountCodes = createDiscountCodes({ find: async code => ({ id: 101, code, discount_type: 'percent', amount: '10' }),
    productCategories: async () => new Map() });
  const figures = [];
  for (const exempt of [false, true]) {
    const { result } = renderSale({ discountCodes });
    add(result);
    if (exempt) toggle(result, true);
    await act(async () => { expect(await result.current.applyCoupon('ten')).toBeNull(); });
    takeCash(result, 500);
    const id = result.current.order.id;
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    await act(async () => { expect(await result.current.resume(id)).toBeNull(); });
    const find = vi.spyOn(discountCodes, 'find').mockResolvedValue({ refusal: COUPONS_NEED_CONNECTION, transient: true });
    await act(async () => { expect(result.current.voidTender(result.current.order.payments[0].id)).toBe(true); });
    expect(find).toHaveBeenCalled();
    expect(result.current.order.coupons?.length ?? 0).toBe(0);
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    const draft = await db.pos_drafts.findOne(id).exec();
    const parked: Order = JSON.parse(draft!.toJSON().data);
    expect(exempt ? parked.exemptedFrom : parked).toMatchObject({ couponPricesStale: true, coupons: [{ code: 'ten', discountTaxMinor: 10 }] });
    find.mockRestore();
    await act(async () => { expect(await result.current.resume(id)).toBeNull(); });
    if (exempt) toggle(result, false);
    figures.push([result.current.order.coupons![0].discountTaxMinor, result.current.order.taxMinor]);
  }
  expect(figures[1]).toEqual(figures[0]);
});
