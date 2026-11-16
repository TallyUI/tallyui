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
import { TENDER_GATE_FAILED, useSale } from './use-sale';

const entries = catalogueEntries([{ id: 10, name: 'Shirt', price: '10.00' }], traits, { currency: 'GBP' });
const taxProps = { pricesIncludeTax: false, ratesPpm: { default: 200000 }, taxRates: { standard: [
  { id: 1, code: 'rate-1', label: 'VAT', rate: '20.0000', priority: 1, compound: false, shipping: true },
] } };
type TenderGate = NonNullable<Parameters<typeof useSale>[1]['tenderGate']>;

describe('useSale tender gate', () => {
  let db: RxDatabase;
  beforeEach(async () => {
    db = await createRxDatabase({ name: `saletendergate${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    await db.addCollections({ pos_drafts: { schema: orderDraftSchema } });
  });
  afterEach(async () => { cleanup(); await db.remove(); });

  async function renderSale(tenderGate: TenderGate, empty = false) {
    function Wrapper({ children }: { children: ReactNode }) {
      return <TaxProvider {...taxProps}>{children}</TaxProvider>;
    }
    const hook = renderHook(() => useSale({ currency: 'GBP' }, {
      registerId: 'register-1', cashierRef: 'cashier@store.test', drafts: db.pos_drafts, tenderGate,
    }), { wrapper: Wrapper });
    if (!empty) await act(async () => { hook.result.current.add(entries[0], traits); });
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
  });

  it('does not call the gate for an empty cart', async () => {
    const gate = vi.fn<TenderGate>().mockResolvedValue(null);
    const { result } = await renderSale(gate, true);
    await act(async () => { result.current.startTender('cash'); });
    expect(gate).not.toHaveBeenCalled();
    expect(result.current.stage).toEqual({ kind: 'cart' });
  });
});
