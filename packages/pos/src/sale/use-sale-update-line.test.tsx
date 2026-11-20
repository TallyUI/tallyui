import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { ORDER_LINE_SKU_MAX, woocommerceTax, type StoreSettings } from '@tallyui/core';
import { wooProductTraits as traits } from '@tallyui/connector-woocommerce';
import { orderDraftSchema, type CustomerSummary } from '../order';
import { toOrderCreateEnvelope } from '../pos-order/command';
import { finalizeOrder } from '../pos-order/finalize';
import type { PosOrder } from '../pos-order/types';
import { TaxProvider, saleTaxContexts } from '../tax';
import { taxProviderProps } from '../store-settings';
import { catalogueEntries } from './catalogue';
import { LINE_EDIT_REFUSED, SALE_FINISHED, SALE_HAS_PAYMENT, useSale } from './use-sale';

const longSku = 'L'.repeat(120);
const entries = catalogueEntries([{ id: 10, name: 'Shirt', price: '10.00', sku: 'SHIRT-1' },
  { id: 11, name: 'Long', price: '5.00', sku: longSku }], traits, { currency: 'AUD' });
const wooRate = (id: number, country: string, rate: string): woocommerceTax.WooTaxRate => ({
  id, country, state: '', postcode: '', city: '', postcodes: [], cities: [], rate, name: 'GST',
  priority: 1, compound: false, shipping: true, order: id, class: 'standard',
});
const AU = { id: 1, code: 'AU-GST-1', label: 'GST', rate: '10.0000', priority: 1, compound: false, shipping: true };
const settings: StoreSettings = {
  currency: 'AUD', pricesIncludeTax: false, taxRatesPpm: { default: 100000 }, taxRates: { standard: [AU] },
  taxRounding: { granularity: 'woocommerce', roundAtSubtotal: false }, taxClassSlugs: ['standard'], shippingTaxClass: 'inherit',
  taxBasedOn: 'shipping', baseTaxAddress: { country: 'AU', state: 'NSW', city: 'Sydney', postcode: '2000' },
  taxRateTable: [wooRate(1, 'AU', '10.0000')],
};
const auCustomer: CustomerSummary = { id: '9', name: 'Matt', shipping: { country: 'AU', state: 'VIC' } };
type Sale = { current: ReturnType<typeof useSale> };
type Patch = Parameters<ReturnType<typeof useSale>['updateLine']>[1];
const lineSkus = (sent: ReturnType<typeof toOrderCreateEnvelope>) => sent.payload.lines.map((line) => 'sku' in line ? line.sku : undefined);

describe('useSale updateLine (ADR-092 6b/6c)', () => {
  let db: RxDatabase;
  beforeEach(async () => {
    db = await createRxDatabase({ name: `saleupdateline${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    await db.addCollections({ pos_drafts: { schema: orderDraftSchema } });
  });
  afterEach(async () => { cleanup(); await db.remove(); });

  function saleOf(entry = entries[0]) {
    const taxContextFor = saleTaxContexts(settings, { orderCreateVersion: 8 });
    function Wrapper({ children }: { children: ReactNode }) {
      return <TaxProvider {...taxProviderProps(settings)}>{children}</TaxProvider>;
    }
    const { result } = renderHook(() => useSale(settings, { registerId: 'register-1', cashierRef: 'cashier@store.test',
      capabilities: { orderCreate: 12 }, drafts: db.pos_drafts, taxContextFor }), { wrapper: Wrapper });
    act(() => result.current.setCustomer(auCustomer));
    act(() => { result.current.add(entry, traits); });
    return result;
  }
  function update(result: Sale, patch: Patch) {
    let refusal: string | null | undefined;
    act(() => { refusal = result.current.updateLine(result.current.order.lineItems[0].id, patch); });
    return refusal;
  }
  /** The sale paid in cash and finalized as the till's own order. */
  function finalized(result: Sale): PosOrder {
    act(() => result.current.startTender('cash'));
    act(() => { result.current.addTender({ method: 'cash', amountMinor: result.current.order.totalMinor }); });
    return finalizeOrder(result.current.order, { capabilities: { orderCreate: 12 } });
  }
  /** saleOnReceipt from use-sale-receipt-stage.test.tsx, adapted: the sale paid by a captured cash leg and completed. */
  async function saleOnReceipt() {
    const result = saleOf();
    act(() => { expect(result.current.addTender({ method: 'cash', amountMinor: result.current.order.totalMinor })).toEqual(expect.any(String)); });
    await act(async () => { await result.current.complete(); });
    const receipt = result.current.stage;
    if (receipt.kind !== 'receipt') throw new Error('Expected receipt');
    return { result, receipt };
  }
  /** S2's sale: a Shirt line edited in name, SKU and regular price, parked and resumed. */
  async function resumedEdited() {
    const result = saleOf();
    expect(update(result, { name: 'Gift shirt', sku: 'S-EDIT', regularUnitPriceMinor: 1500 })).toBeNull();
    const id = result.current.order.id;
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    expect(result.current.order.lineItems).toHaveLength(0);
    await act(async () => { expect(await result.current.resume(id)).toBeNull(); });
    return result;
  }

  it('S1: edits in the cart, refuses in tender without changing anything, and edits again after cancelTender', () => {
    const result = saleOf();
    expect(update(result, { name: 'Gift shirt' })).toBeNull();
    expect(result.current.order.lineItems[0].name).toBe('Gift shirt');
    act(() => result.current.startTender('cash'));
    const before = result.current.order;
    expect(update(result, { name: 'Other', sku: 'X', regularUnitPriceMinor: 1 })).toBe(LINE_EDIT_REFUSED);
    expect(result.current.order).toEqual(before);
    expect(result.current.error).toBeNull();
    act(() => result.current.cancelTender());
    expect(update(result, { name: 'Other' })).toBeNull();
    expect(result.current.order.lineItems[0].name).toBe('Other');
  });

  it('S7: in the cart with an unlocked captured leg, updateLine refuses with SALE_HAS_PAYMENT, sets it as the error and leaves the order equal', async () => {
    const result = saleOf();
    act(() => { expect(result.current.addTender({ method: 'cash', amountMinor: 500, status: 'captured' })).toEqual(expect.any(String)); });
    const id = result.current.order.id;
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    await act(async () => { expect(await result.current.resume(id)).toBeNull(); });
    expect(result.current.stage.kind).toBe('cart');
    expect(result.current.order.payments).toEqual([expect.objectContaining({ method: 'cash', amountMinor: 500, status: 'captured' })]);
    expect(result.current.order.payments[0].locked).toBeFalsy();
    const before = result.current.order;
    expect(update(result, { name: 'Other', sku: 'X', regularUnitPriceMinor: 1 })).toBe(SALE_HAS_PAYMENT);
    expect(result.current.error).toBe(SALE_HAS_PAYMENT);
    expect(result.current.order).toEqual(before);
  });

  it('S8: on the receipt, updateLine refuses with SALE_FINISHED, sets it as the error and changes neither the order nor the stage', async () => {
    const { result, receipt } = await saleOnReceipt();
    const before = result.current.order;
    expect(update(result, { name: 'Other', sku: 'X', regularUnitPriceMinor: 1 })).toBe(SALE_FINISHED);
    expect(result.current.error).toBe(SALE_FINISHED);
    expect(result.current.order).toEqual(before);
    expect(result.current.stage).toBe(receipt);
  });

  it('S2: a parked edited line resumes with both SKUs, and a later scan adds a new line', async () => {
    const result = await resumedEdited();
    expect(result.current.order.lineItems).toHaveLength(1);
    expect(result.current.order.lineItems[0]).toMatchObject({ name: 'Gift shirt', sku: 'S-EDIT', catalogueSku: 'SHIRT-1', regularUnitPriceMinor: 1500 });
    act(() => { result.current.add(entries[0], traits); });
    const lines = result.current.order.lineItems;
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatchObject({ name: 'Shirt', sku: 'SHIRT-1', quantity: 1 });
    expect(lines[1].catalogueSku).toBeUndefined();
  });

  it('S5: a name-only edit never merges a later scan of the same product', () => {
    const result = saleOf();
    expect(update(result, { name: 'Gift shirt' })).toBeNull();
    act(() => { result.current.add(entries[0], traits); });
    const lines = result.current.order.lineItems;
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ name: 'Gift shirt', sku: 'SHIRT-1', quantity: 1 });
    expect(lines[1]).toMatchObject({ name: 'Shirt', sku: 'SHIRT-1', quantity: 1 });
  });

  it('S3: finalize stores the catalogue SKU; cap 12 sends the edited SKU at 12, cap 11 sends none; a name-only edit keeps the version', async () => {
    const order = finalized(await resumedEdited());
    expect(order.lines[0]).toMatchObject({ sku: 'S-EDIT', catalogueSku: 'SHIRT-1' });
    const at12 = toOrderCreateEnvelope(order, 'device_1', 1, { maxVersion: 12 });
    expect(at12.version).toBe(12);
    expect(lineSkus(at12)).toEqual(['S-EDIT']);
    const at11 = toOrderCreateEnvelope(order, 'device_1', 1, { maxVersion: 11 });
    expect(at11.version).toBe(11);
    expect(lineSkus(at11)).toEqual([undefined]);

    const plain = toOrderCreateEnvelope(finalized(saleOf()), 'device_1', 1, { maxVersion: 12 });
    const renamed = saleOf();
    expect(update(renamed, { name: 'Gift shirt' })).toBeNull();
    const renamedOrder = finalized(renamed);
    expect('catalogueSku' in renamedOrder.lines[0]).toBe(false);
    const sent = toOrderCreateEnvelope(renamedOrder, 'device_1', 1, { maxVersion: 12 });
    expect(sent.version).toBe(plain.version);
    expect(lineSkus(sent)).toEqual([undefined]);
  });

  it('S4: a long catalogue SKU edited and edited back is cut with its catalogue SKU, so it reads as unedited', () => {
    const result = saleOf(entries[1]);
    expect(update(result, { sku: 'OTHER' })).toBeNull();
    expect(update(result, { sku: longSku })).toBeNull();
    expect(result.current.order.lineItems[0]).toMatchObject({ sku: longSku, catalogueSku: longSku });
    const order = finalized(result);
    const cut = `${longSku.slice(0, ORDER_LINE_SKU_MAX - 1)}…`;
    expect(order.lines[0]).toMatchObject({ sku: cut, catalogueSku: cut });
    const sent = toOrderCreateEnvelope(order, 'device_1', 1, { maxVersion: 12 });
    expect(sent.version).toBe(11);
    expect(lineSkus(sent)).toEqual([undefined]);
  });
});
