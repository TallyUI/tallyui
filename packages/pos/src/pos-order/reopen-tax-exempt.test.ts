import { createElement, type ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { StoreSettings } from '@tallyui/core';
import { createOrderBuilder, orderDraftSchema, type Order } from '../order';
import { chargeOrderModeMinor } from '../order/order-builder';
import { registerSessionCreator } from '../register/schemas';
import type { RegisterSessionCollection } from '../register/session-store';
import { TAX_EXEMPT_REMOVED, useSale } from '../sale/use-sale';
import { taxProviderProps } from '../store-settings';
import { createTaxContext, TaxProvider } from '../tax';
import { finalizeOrder } from './finalize';
import { reopenRefusedOrder } from './reopen';
import { posOrderCollection } from './schema';
import type { PosOrder } from './types';
import { uuidv7 } from './uuidv7';

const generic: StoreSettings = { currency: 'AUD', pricesIncludeTax: false,
  taxRatesPpm: { default: 190000, standard: 190000, fee: 210000, post: 77000 }, taxRateCodes: { standard: 'standard', fee: 'fee', post: 'post' },
  taxRounding: { granularity: 'per_line_items', mode: 'half_up' } };
const woo: StoreSettings = { currency: 'AUD', pricesIncludeTax: false, taxRatesPpm: { default: 100000 },
  taxRates: { standard: [{ id: 1, code: 'AU-GST-1', label: 'GST', rate: '10.0000', priority: 1, compound: false, shipping: true }] },
  taxRounding: { granularity: 'woocommerce', roundAtSubtotal: false }, taxClassSlugs: ['standard'], shippingTaxClass: 'inherit' };
const capabilities = { orderCreate: 12, taxExempt: true };
let db: RxDatabase<{ pos_orders: RxCollection<PosOrder>; order_drafts: RxCollection; register_sessions: RegisterSessionCollection }>;
beforeEach(async () => {
  db = await createRxDatabase({ name: `reopenexempt${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  await db.addCollections({ pos_orders: posOrderCollection(), order_drafts: { schema: orderDraftSchema }, register_sessions: registerSessionCreator() });
});
afterEach(async () => { cleanup(); await db.remove(); });

async function reopen(settings: StoreSettings, reopenSettings = settings, feeGross?: number, shippingGross = feeGross) {
  const builder = createOrderBuilder({ currency: settings.currency, taxContext: createTaxContext(taxProviderProps(settings)) });
  builder.addLine({ productId: '10', name: 'Shirt', taxClass: 'standard', unitPrice: { amount: 1000, currency: settings.currency } });
  builder.addFee({ ...(feeGross === undefined ? {} : { amountIncludesTax: true }), name: 'Bag', amountMinor: feeGross ?? 200, taxClass: settings === woo ? 'standard' : 'fee' });
  builder.addShipping({ ...(shippingGross === undefined ? {} : { amountIncludesTax: true }), name: 'Post', amountMinor: shippingGross ?? 103, taxClass: settings === woo ? 'standard' : 'post' });
  const taxed = builder.getSnapshot();
  builder.setTaxExempt(true);
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  const stored = finalizeOrder(builder.getSnapshot(), { capabilities });
  await db.pos_orders.insert({ ...stored, syncStatus: 'rejected', error: { code: 'total_mismatch', message: 'Total mismatch' } });
  const id = await reopenRefusedOrder(stored.id, { orders: db.pos_orders, drafts: db.order_drafts, sessions: db.register_sessions,
    taxContext: createTaxContext(taxProviderProps(reopenSettings)), capabilities });
  const row = await db.order_drafts.findOne(id).exec();
  const draft: Order = JSON.parse(row!.data);
  return { stored, draft, taxed };
}

it.each([['R1 generic', generic, '190000000'], ['R2 Woo', woo, '100000000']] as const)('%s reopens exempt and restores the line class tax on switch-off', async (_, settings, taxMicros) => {
  const { stored, draft } = await reopen(settings);
  expect(draft.taxExempt).toBe(true);
  expect(draft.totalMinor).toBe(stored.totalMinor);
  expect(draft.lineItems.map(line => line.netMinor)).toEqual(stored.lines.map(line => line.netMinor));
  for (const key of ['fees', 'shipping'] as const) expect(draft[key]!.map(row => row.amountMinor)).toEqual(stored[key]!.map(row => row.amountMinor));
  const wrapper = ({ children }: { children: ReactNode }) => createElement(TaxProvider, { ...taxProviderProps(settings), children });
  const { result } = renderHook(() => useSale(settings, { registerId: 'register-1', cashierRef: 'cashier@store.test', drafts: db.order_drafts, capabilities }), { wrapper });
  await act(async () => { expect(await result.current.resume(draft.id)).toBeNull(); });
  expect(result.current.taxExempt).toBe(true);
  act(() => { expect(result.current.setTaxExempt(false)).toBe(true); });
  expect(result.current.order.lineItems.map(line => line.taxMicros)).toEqual([taxMicros]);
});

it('R3 reopens taxed when prices now include tax', async () => {
  const { draft } = await reopen(generic, { ...generic, pricesIncludeTax: true });
  expect(draft).not.toHaveProperty('taxExempt');
});

const perOrder: StoreSettings = { ...generic, taxRounding: { granularity: 'per_order', mode: 'half_up' } };
it.each([['per_line_items', generic, 902], ['per_order', perOrder, 902], ['woocommerce', woo, 907]] as const)(
  'G6 reopens exempt then restores the quoted inclusive charges (%s)', async (_, settings, amountMinor) => {
    const { stored, draft, taxed } = await reopen(settings, settings, amountMinor);
    expect(draft.taxExempt).toBe(true);
    expect(draft.totalMinor).toBe(stored.totalMinor);
    for (const key of ['fees', 'shipping'] as const) expect(draft[key]![0].amountMinor).toBe(stored[key]![0].amountMinor);
    const wrapper = ({ children }: { children: ReactNode }) => createElement(TaxProvider, { ...taxProviderProps(settings), children });
    const { result } = renderHook(() => useSale(settings, { registerId: 'register-1', cashierRef: 'cashier@store.test', drafts: db.order_drafts, capabilities }), { wrapper });
    await act(async () => { expect(await result.current.resume(draft.id)).toBeNull(); });
    expect(result.current.taxExempt).toBe(true);
    act(() => { expect(result.current.setTaxExempt(false)).toBe(true); });
    const restored = result.current.order;
    expect([restored.fees![0], restored.shipping![0]].map(row => chargeOrderModeMinor({ ...row,
      amountIncludesTax: row.amountIncludesTax ?? restored.pricesIncludeTax }, true))).toEqual([amountMinor, amountMinor]);
    expect(restored.totalMinor).toBe(taxed.totalMinor);
    for (const key of ['fees', 'shipping'] as const) {
      expect(restored[key]).toMatchObject([{ amountMinor, amountIncludesTax: true }]);
      expect(restored.display[key]).toEqual([{ ...taxed.display[key]![0], id: restored[key]![0].id }]);
    }
  });

it('G7 reopens the original inclusive charges without exemption in a now-inclusive store', async () => {
  const { draft } = await reopen(generic, { ...generic, pricesIncludeTax: true }, 902);
  expect(draft).not.toHaveProperty('taxExempt');
  for (const key of ['fees', 'shipping'] as const) expect(draft[key]).toMatchObject([{ amountMinor: 902, amountIncludesTax: true }]);
});

it.each([['G10 generic', generic, 1000, 999, 3189], ['G11 Woo', woo, 500, 500, 2100]] as const)(
  '%s restores the literal gross fee, shipping and sale total after switch-off', async (_, settings, fee, shipping, total) => {
    const { draft } = await reopen(settings, settings, fee, shipping);
    const wrapper = ({ children }: { children: ReactNode }) => createElement(TaxProvider, { ...taxProviderProps(settings), children });
    const { result } = renderHook(() => useSale(settings, { registerId: 'register-1', cashierRef: 'cashier@store.test', drafts: db.order_drafts, capabilities }), { wrapper });
    await act(async () => { expect(await result.current.resume(draft.id)).toBeNull(); });
    expect(result.current.taxExempt).toBe(true);
    act(() => { expect(result.current.setTaxExempt(false)).toBe(true); });
    expect(result.current.order.totalMinor).toBe(total);
    expect(result.current.order.fees).toMatchObject([{ amountMinor: fee, amountIncludesTax: true }]);
    expect(result.current.order.shipping).toMatchObject([{ amountMinor: shipping, amountIncludesTax: true }]);
  });

it('R4 warns once when reopen drops exemption in a now-inclusive store', async () => {
  const settings = { ...generic, pricesIncludeTax: true };
  const { draft } = await reopen(generic, settings);
  expect(draft).not.toHaveProperty('taxExempt');
  expect(draft.taxExemptDropped).toBe(true);
  const wrapper = ({ children }: { children: ReactNode }) => createElement(TaxProvider, { ...taxProviderProps(settings), children });
  const { result } = renderHook(() => useSale(settings, { registerId: 'register-1', cashierRef: 'cashier@store.test', drafts: db.order_drafts, capabilities }), { wrapper });
  await act(async () => { expect(await result.current.resume(draft.id)).toBeNull(); });
  expect(result.current.error).toContain(TAX_EXEMPT_REMOVED);
  expect(result.current.order).not.toHaveProperty('taxExemptDropped');
  await act(async () => { expect(await result.current.park()).toBeNull(); });
  await act(async () => { expect(await result.current.resume(draft.id)).toBeNull(); });
  expect(result.current.error).toBeNull();
});

it('R5 resumes without a warning when reopen keeps exemption', async () => {
  const { draft } = await reopen(generic);
  expect(draft).not.toHaveProperty('taxExemptDropped');
  const wrapper = ({ children }: { children: ReactNode }) => createElement(TaxProvider, { ...taxProviderProps(generic), children });
  const { result } = renderHook(() => useSale(generic, { registerId: 'register-1', cashierRef: 'cashier@store.test', drafts: db.order_drafts, capabilities }), { wrapper });
  await act(async () => { expect(await result.current.resume(draft.id)).toBeNull(); });
  expect(result.current.taxExempt).toBe(true);
  expect(result.current.error).toBeNull();
});
