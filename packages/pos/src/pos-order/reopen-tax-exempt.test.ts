import { createElement, type ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { StoreSettings } from '@tallyui/core';
import { payloadShapeErrors } from '@tallyui/core/server';
import { createOrderBuilder, orderDraftSchema, restoreOrderDraft, type Order } from '../order';
import { chargeOrderModeMinor } from '../order/order-builder';
import { registerSessionCreator } from '../register/schemas';
import type { RegisterSessionCollection } from '../register/session-store';
import { TAX_EXEMPT_REMOVED, useSale } from '../sale/use-sale';
import { taxProviderProps } from '../store-settings';
import { createTaxContext, TaxProvider } from '../tax';
import { toOrderCreateEnvelope } from './command';
import { finalizeOrder } from './finalize';
import { reopenRefusedOrder } from './reopen';
import { posOrderCollection } from './schema';
import type { PosOrder } from './types';
import { uuidv7 } from './uuidv7';

const generic: StoreSettings = { currency: 'AUD', pricesIncludeTax: false,
  taxRatesPpm: { default: 190000, standard: 190000, reduced: 70000, fee: 210000, post: 77000 }, taxRateCodes: { standard: 'standard', reduced: 'reduced', fee: 'fee', post: 'post' },
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

async function reopen(settings: StoreSettings, reopenSettings = settings, feeGross?: number, shippingGross = feeGross, reason?: PosOrder['taxExemptReason']) {
  const builder = createOrderBuilder({ currency: settings.currency, taxContext: createTaxContext(taxProviderProps(settings)) });
  builder.addLine({ productId: '10', name: 'Shirt', taxClass: 'standard', unitPrice: { amount: 1000, currency: settings.currency } });
  builder.addFee({ ...(feeGross === undefined ? {} : { amountIncludesTax: true }), name: 'Bag', amountMinor: feeGross ?? 200, taxClass: settings === woo ? 'standard' : 'fee' });
  builder.addShipping({ ...(shippingGross === undefined ? {} : { amountIncludesTax: true }), name: 'Post', amountMinor: shippingGross ?? 103, taxClass: settings === woo ? 'standard' : 'post' });
  const taxed = builder.getSnapshot();
  builder.setTaxExempt(true);
  if (reason) builder.setTaxExemptReason(reason);
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  const store = reason ? { ...capabilities, orderCreate: 13, taxExemptReason: 'optional' as const } : capabilities;
  const stored = finalizeOrder(builder.getSnapshot(), { capabilities: store });
  await db.pos_orders.insert({ ...stored, syncStatus: 'rejected', error: { code: 'total_mismatch', message: 'Total mismatch' } });
  const id = await reopenRefusedOrder(stored.id, { orders: db.pos_orders, drafts: db.order_drafts, sessions: db.register_sessions,
    taxContext: createTaxContext(taxProviderProps(reopenSettings)), capabilities: store });
  const row = await db.order_drafts.findOne(id).exec();
  const draft: Order = JSON.parse(row!.data);
  return { stored, draft, taxed };
}

it.each([false, true])('reopens a refused order with its reason only if still exempt (inclusive = %s)', async (pricesIncludeTax) => {
  const reason = { text: 'Charity', certificateId: 'ST5-0042' };
  const { stored, draft } = await reopen(generic, { ...generic, pricesIncludeTax }, undefined, undefined, reason);
  expect(stored.taxExemptReason).toStrictEqual(reason);
  expect(draft.taxExempt).toBe(pricesIncludeTax ? undefined : true);
  expect(draft.taxExemptReason).toStrictEqual(pricesIncludeTax ? undefined : reason);
});

it.each(['B1', 'B2'])('%s preserves both quoted rate codes through a refused exempt sale', async row => {
  const taxContext = createTaxContext(taxProviderProps(generic));
  const options = { currency: generic.currency, taxContext }, builder = createOrderBuilder(options);
  for (const [taxClass, amount] of [['reduced', 1005], ['standard', 1002]] as const) {
    builder.addLine({ productId: taxClass, name: taxClass, taxClass, unitPrice: { amount, currency: generic.currency } });
  }
  const taxed = builder.getSnapshot();
  builder.setTaxExempt(true);
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  const stored = finalizeOrder(builder.getSnapshot(), { capabilities });
  await db.pos_orders.insert({ ...stored, syncStatus: 'rejected', error: { code: 'total_mismatch', message: 'Total mismatch' } });
  const id = await reopenRefusedOrder(stored.id, { orders: db.pos_orders, drafts: db.order_drafts, sessions: db.register_sessions, taxContext, capabilities });
  const draft = await db.order_drafts.findOne(id).exec();
  const reopened = restoreOrderDraft(JSON.parse(draft!.data), options);
  if (row === 'B2') {
    reopened.setTaxExempt(false);
    expect(taxed).toMatchObject({ taxMinor: 260, totalMinor: 2267 });
    expect(reopened.getSnapshot()).toMatchObject({ taxMinor: taxed.taxMinor, totalMinor: taxed.totalMinor });
    return;
  }
  const first = toOrderCreateEnvelope(stored, 'till', 1, { maxVersion: 12 }).payload;
  const second = toOrderCreateEnvelope(finalizeOrder(reopened.getSnapshot(), { capabilities }), 'till', 1, { maxVersion: 12 }).payload;
  expect(first.taxByRate).toMatchObject([{ code: 'reduced', netMinor: 1005 }, { code: 'standard', netMinor: 1002 }]);
  expect(second.taxByRate).toEqual(first.taxByRate);
  for (const payload of [first, second]) {
    expect(payload.totalMinor).toBe(2007);
    expect(payloadShapeErrors(payload)).toEqual([]);
  }
});

it('B3 leaves an uncoded given-rate line uncoded when exempt', () => {
  const builder = createOrderBuilder({ currency: generic.currency, taxContext: createTaxContext(taxProviderProps(generic)) });
  builder.addLine({ productId: '1', name: 'Item', taxRates: [{ ratePpm: 70000 }], unitPrice: { amount: 1005, currency: generic.currency } });
  builder.setTaxExempt(true);
  expect(builder.getSnapshot().lineItems[0].taxLines).toStrictEqual([{ ratePpm: 0, taxMicros: '0' }]);
});

it('B4 keeps Woo exempt line tax rows empty before and after reopen', async () => {
  const { stored, draft } = await reopen(woo);
  expect(stored.lines.map(line => line.taxLines)).toEqual([[]]);
  expect(draft.lineItems.map(line => line.taxLines)).toEqual([[]]);
});

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
const moved: StoreSettings = { ...generic, taxRatesPpm: { ...generic.taxRatesPpm, fee: 250000, post: 100000 } };
// G16–G18/G21: 1000 / 1.21 = 826.45 → 826; 999 / 1.077 = 927.58 → 928; exempt total = 1000 + 826 + 928 = 2754.
// Moved rates: 1000 / 1.25 = 800; 999 / 1.10 = 908.18 → 908. Repricing the nets would give 2708.
// Switched off: 1190 (Shirt keeps 19% through taxedRates) + 1000 + 999 = 3189; 3189 − 2754 = 435.
it.each([['G16', generic, moved, 1000, 999, 3189], ['G17', generic, moved, 1000, 999, 3189], ['G19', woo, woo, 500, 500, 2100]] as const)(
  '%s keeps the exempt quote until the sale switches back to entered gross', async (row, original, settings, fee, shipping, total) => {
    const { draft, stored } = await reopen(original, settings, fee, shipping);
    const wrapper = ({ children }: { children: ReactNode }) => createElement(TaxProvider, { ...taxProviderProps(settings), children });
    const { result } = renderHook(() => useSale(settings, { registerId: 'register-1', cashierRef: 'cashier@store.test', drafts: db.order_drafts, capabilities }), { wrapper });
    await act(async () => { expect(await result.current.resume(draft.id)).toBeNull(); });
    if (row === 'G17') {
      await act(async () => { expect(await result.current.park()).toBeNull(); });
      await act(async () => { expect(await result.current.resume(draft.id)).toBeNull(); });
    }
    expect(result.current.taxExempt).toBe(true);
    expect(result.current.order.totalMinor).toBe(stored.totalMinor);
    if (row !== 'G19') {
      expect(result.current.order).toMatchObject({ totalMinor: 2754, changeDueMinor: 0, balanceDueMinor: 0,
        display: { fees: [{ amountMinor: 826 }], shipping: [{ amountMinor: 928 }] } });
    }
    act(() => { expect(result.current.setTaxExempt(false)).toBe(true); });
    expect(result.current.order).toMatchObject({ totalMinor: total, fees: [{ amountMinor: fee, amountIncludesTax: true }],
      shipping: [{ amountMinor: shipping, amountIncludesTax: true }] });
    if (row !== 'G19') expect(result.current.order.balanceDueMinor).toBe(435);
  });

it('G18 keeps the stored net on a second switch to exemption', async () => {
  const { draft } = await reopen(generic, moved, 1000, 999);
  const builder = restoreOrderDraft(draft, { currency: moved.currency, taxContext: createTaxContext(taxProviderProps(moved)) });
  builder.setTaxExempt(false);
  expect(builder.getSnapshot().totalMinor).toBe(3189);
  builder.setTaxExempt(true);
  expect(builder.getSnapshot().totalMinor).toBe(2754);
});

it('G21 finalizes the reopened charge nets without storing the draft override', async () => {
  const { draft } = await reopen(generic, moved, 1000, 999);
  const builder = restoreOrderDraft(draft, { currency: moved.currency, taxContext: createTaxContext(taxProviderProps(moved)) });
  const order = finalizeOrder(builder.getSnapshot(), { capabilities });
  expect(order).toMatchObject({ totalMinor: 2754, fees: [{ amountMinor: 826 }], shipping: [{ amountMinor: 928 }] });
  for (const key of ['fees', 'shipping'] as const) expect(order[key]![0]).not.toHaveProperty('exemptMinor');
  expect(payloadShapeErrors(toOrderCreateEnvelope(order, 'till', 1, { maxVersion: 12 }).payload)).toEqual([]);
});

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

// G12/G13 reduced line: 1000 × 7% = 70 tax; 1000 + 70 = 1070.
// G12/G13 standard line: 1000 × 19% = 190 tax; 1000 + 190 = 1190.
// G12/G13 exempt total: 1000 + 1000 = 2000.
// G12/G13 restored total: 1070 + 1190 = 2260 under either rounding mode.
// G14 given-rate line: 500 × 0% = 0 tax; gross stays 500.
// G14 exempt total: 1000 + 500 = 1500.
// G14 restored total: 1070 + 500 = 1570.
it.each([['G12', generic], ['G13', perOrder], ['G14', generic]] as const)(
  '%s restores the quoted line rates when exemption is removed', async (row, settings) => {
    const taxContext = createTaxContext(taxProviderProps(settings));
    const builder = createOrderBuilder({ currency: settings.currency, taxContext });
    const unitPrice = { amount: 1000, currency: settings.currency };
    builder.addLine({ productId: 'A', name: 'A', taxClass: 'reduced', unitPrice });
    if (row === 'G14') builder.addLine({ productId: 'B', name: 'B', taxRates: [{ code: 'zero', ratePpm: 0 }], unitPrice: { ...unitPrice, amount: 500 } });
    else builder.addLine({ productId: 'B', name: 'B', taxClass: 'standard', unitPrice });
    builder.setTaxExempt(true);
    builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
    const stored = finalizeOrder(builder.getSnapshot(), { capabilities });
    await db.pos_orders.insert({ ...stored, syncStatus: 'rejected', error: { code: 'total_mismatch', message: 'Total mismatch' } });
    const id = await reopenRefusedOrder(stored.id, { orders: db.pos_orders, drafts: db.order_drafts, sessions: db.register_sessions, taxContext, capabilities });
    const wrapper = ({ children }: { children: ReactNode }) => createElement(TaxProvider, { ...taxProviderProps(settings), children });
    const { result } = renderHook(() => useSale(settings, { registerId: 'register-1', cashierRef: 'cashier@store.test', drafts: db.order_drafts, capabilities }), { wrapper });
    await act(async () => { expect(await result.current.resume(id)).toBeNull(); });
    expect(result.current.taxExempt).toBe(true);
    expect(result.current.order.totalMinor).toBe(row === 'G14' ? 1500 : 2000);
    act(() => { expect(result.current.setTaxExempt(false)).toBe(true); });
    expect(result.current.order.lineItems.map(line => line.taxMicros)).toEqual(['70000000', row === 'G14' ? '0' : '190000000']);
    expect(result.current.order.totalMinor).toBe(row === 'G14' ? 1570 : 2260);
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
