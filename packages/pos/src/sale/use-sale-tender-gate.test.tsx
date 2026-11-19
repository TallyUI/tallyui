import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { woocommerceTax, type StoreSettings } from '@tallyui/core';
import { wooProductTraits as traits } from '@tallyui/connector-woocommerce';
import { orderDraftSchema, type CustomerSummary } from '../order';
import { TaxProvider, saleTaxContexts } from '../tax';
import { taxProviderProps } from '../store-settings';
import { catalogueEntries } from './catalogue';
import { TENDER_GATE_FAILED, TENDER_SALE_CHANGED, useSale } from './use-sale';

const entries = catalogueEntries([{ id: 10, name: 'Shirt', price: '10.00' }], traits, { currency: 'GBP' });
const taxProps = { pricesIncludeTax: false, ratesPpm: { default: 200000 }, taxRates: { standard: [
  { id: 1, code: 'rate-1', label: 'VAT', rate: '20.0000', priority: 1, compound: false, shipping: true },
] } };
// Woo contexts as in use-sale-tax-location.test.tsx: AU 10% at the base, NZ 15% by address.
const wooRate = (id: number, country: string, rate: string): woocommerceTax.WooTaxRate => ({
  id, country, state: '', postcode: '', city: '', postcodes: [], cities: [], rate, name: 'GST',
  priority: 1, compound: false, shipping: true, order: id, class: 'standard',
});
const wooSettings: StoreSettings = {
  currency: 'AUD', pricesIncludeTax: false, taxRatesPpm: { default: 100000 },
  taxRates: { standard: [{ id: 1, code: 'AU-GST-1', label: 'GST', rate: '10.0000', priority: 1, compound: false, shipping: true }] },
  taxRounding: { granularity: 'woocommerce', roundAtSubtotal: false }, taxClassSlugs: ['standard'], shippingTaxClass: 'inherit',
  taxBasedOn: 'shipping', baseTaxAddress: { country: 'AU', state: 'NSW', city: 'Sydney', postcode: '2000' },
  taxRateTable: [wooRate(1, 'AU', '10.0000'), wooRate(2, 'NZ', '15.0000')],
};
const wooEntries = catalogueEntries([{ id: 10, name: 'Shirt', price: '10.00' }], traits, { currency: 'AUD' });
const nzCustomer: CustomerSummary = { id: '7', name: 'Kiri', shipping: { country: 'NZ', city: 'Auckland', postcode: '1010' } };
type TenderGate = NonNullable<Parameters<typeof useSale>[1]['tenderGate']>;

describe('useSale tender gate', () => {
  let db: RxDatabase;
  beforeEach(async () => {
    db = await createRxDatabase({ name: `saletendergate${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    await db.addCollections({ pos_drafts: { schema: orderDraftSchema } });
  });
  afterEach(async () => { cleanup(); await db.remove(); });

  /** `woo` renders on wooSettings with `taxContextFor`, so a customer can move the rates. */
  async function renderSale(tenderGate: TenderGate, empty = false, woo = false) {
    const taxContextFor = woo ? saleTaxContexts(wooSettings, { orderCreateVersion: 8 }) : undefined;
    function Wrapper({ children }: { children: ReactNode }) {
      return <TaxProvider {...(woo ? taxProviderProps(wooSettings) : taxProps)}>{children}</TaxProvider>;
    }
    const hook = renderHook(() => useSale(woo ? wooSettings : { currency: 'GBP' }, {
      registerId: 'register-1', cashierRef: 'cashier@store.test', drafts: db.pos_drafts, tenderGate,
      ...(woo ? { capabilities: { orderCreate: 8 }, taxContextFor } : {}),
    }), { wrapper: Wrapper });
    if (!empty) await act(async () => { hook.result.current.add((woo ? wooEntries : entries)[0], traits); });
    return hook;
  }

  it('shows a refusal and stays on the cart', async () => {
    const gate = vi.fn<TenderGate>().mockResolvedValue('Register closed');
    const { result } = await renderSale(gate);
    await act(async () => { result.current.startTender('cash'); });
    expect(result.current.stage).toEqual({ kind: 'cart' });
    expect(result.current.error).toBe('Register closed');
    expect(gate).toHaveBeenCalledTimes(1);
    expect(gate).toHaveBeenCalledWith({ method: 'cash' });
  });

  it('starts the tender when the gate allows it', async () => {
    const { result } = await renderSale(vi.fn<TenderGate>().mockResolvedValue(null));
    await act(async () => { result.current.startTender('cash'); });
    expect(result.current.stage).toEqual({ kind: 'tender', method: 'cash' });
  });

  it('shows TENDER_GATE_FAILED and stays on the cart when the gate rejects', async () => {
    const { result } = await renderSale(vi.fn<TenderGate>().mockRejectedValue(new Error('offline')));
    await act(async () => { result.current.startTender('cash'); });
    expect(result.current.error).toBe(TENDER_GATE_FAILED);
    expect(result.current.stage).toEqual({ kind: 'cart' });
  });

  it('shows TENDER_GATE_FAILED after a synchronous throw and allows another attempt', async () => {
    const gate = vi.fn<TenderGate>()
      .mockImplementationOnce(() => { throw new Error('offline'); })
      .mockResolvedValueOnce(null);
    const { result } = await renderSale(gate);
    await act(async () => { result.current.startTender('cash'); });
    expect(result.current.error).toBe(TENDER_GATE_FAILED);
    expect(result.current.stage).toEqual({ kind: 'cart' });
    await act(async () => { result.current.startTender('cash'); });
    expect(gate).toHaveBeenCalledTimes(2);
    expect(result.current.stage).toEqual({ kind: 'tender', method: 'cash' });
  });

  it('calls a pending gate once across repeated taps', async () => {
    let resolve!: (answer: string | null) => void;
    const answer = new Promise<string | null>((done) => { resolve = done; });
    const gate = vi.fn<TenderGate>(() => answer);
    const { result } = await renderSale(gate);
    await act(async () => { result.current.startTender('cash'); });
    await act(async () => { result.current.startTender('cash'); });
    expect(gate).toHaveBeenCalledTimes(1);
    expect(result.current.stage).toEqual({ kind: 'cart' });
    await act(async () => { resolve(null); });
    expect(result.current.stage).toEqual({ kind: 'tender', method: 'cash' });
  });

  it('ignores an allowance that arrives after newSale', async () => {
    let resolve!: (answer: string | null) => void;
    const answer = new Promise<string | null>((done) => { resolve = done; });
    const { result } = await renderSale(vi.fn<TenderGate>(() => answer));
    await act(async () => { result.current.startTender('cash'); });
    await act(async () => { result.current.newSale(); });
    await act(async () => { result.current.add(entries[0], traits); });
    await act(async () => { resolve(null); });
    expect(result.current.order.lineItems).toHaveLength(1);
    expect(result.current.stage).toEqual({ kind: 'cart' });
    expect(result.current.error).toBeNull();
  });

  it('shows TENDER_SALE_CHANGED when a re-tax swaps the sale while the gate runs (5.2 backlog F5)', async () => {
    let resolve!: (answer: string | null) => void;
    const answer = new Promise<string | null>((done) => { resolve = done; });
    const gate = vi.fn<TenderGate>(() => answer);
    const { result } = await renderSale(gate, false, true);
    await act(async () => { result.current.startTender('cash'); });
    await act(async () => { result.current.setCustomer(nzCustomer); });
    expect(result.current.order.lineItems[0].taxLines.map((tax) => tax.code)).toEqual(['NZ-GST-1']); // re-taxed in the cart
    await act(async () => { resolve(null); });
    expect(result.current.stage).toEqual({ kind: 'cart' });
    expect(result.current.error).toBe(TENDER_SALE_CHANGED);
    expect(gate).toHaveBeenCalledTimes(1);
  });

  it('does not call the gate for an empty cart', async () => {
    const gate = vi.fn<TenderGate>().mockResolvedValue(null);
    const { result } = await renderSale(gate, true);
    await act(async () => { result.current.startTender('cash'); });
    expect(gate).not.toHaveBeenCalled();
    expect(result.current.stage).toEqual({ kind: 'cart' });
  });
});
