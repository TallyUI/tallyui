import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { StoreSettings } from '@tallyui/core';
import { medusaConnector } from '@tallyui/connector-medusa';
import { orderDraftSchema } from '../order';
import { TaxProvider } from '../tax';
import { taxProviderProps } from '../store-settings';
import { catalogueEntries } from './catalogue';
import { useSale } from './use-sale';

const traits = medusaConnector.traits.product;
const entries = catalogueEntries([{
  id: 'shirt', title: 'Shirt', status: 'published', variants: [
    { id: 'blue', title: 'Blue', sku: 'BLUE', prices: [{ amount: 12.5, currency_code: 'eur' }] },
    { id: 'red', title: 'Red', sku: 'RED', prices: [{ amount: 10, currency_code: 'eur' }] },
  ],
}], traits);
const pricing: StoreSettings = { currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 250000 } };

describe('useSale note', () => {
  let db: RxDatabase;

  beforeEach(async () => {
    db = await createRxDatabase({
      name: `salenote${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
      multiInstance: false,
    });
    await db.addCollections({ pos_drafts: { schema: orderDraftSchema } });
  });

  afterEach(async () => {
    cleanup();
    await db.remove();
  });

  function renderSale(overrides: Partial<Parameters<typeof useSale>[1]> = {}) {
    function Wrapper({ children }: { children: ReactNode }) {
      return <TaxProvider {...taxProviderProps(pricing)}>{children}</TaxProvider>;
    }
    return renderHook(() => useSale(pricing, {
      registerId: 'register-1', cashierRef: 'cashier@store.test', capabilities: { orderCreate: 2 },
      drafts: db.pos_drafts, ...overrides,
    }), { wrapper: Wrapper });
  }

  function addSaleLines(result: { current: ReturnType<typeof useSale> }) {
    act(() => {
      result.current.add(entries[0], traits);
      result.current.add(entries[1], traits);
      result.current.add(entries[0], traits);
    });
  }

  it('sets the note on the open sale', () => {
    const { result } = renderSale();
    act(() => result.current.setNote('Gift wrap'));
    expect(result.current.order.note).toBe('Gift wrap');
  });

  it('restores the note when the parked sale is resumed', async () => {
    const { result } = renderSale();
    addSaleLines(result);
    act(() => result.current.setNote('Gift wrap'));
    const draftId = result.current.order.id;
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    await act(async () => { expect(await result.current.resume(draftId)).toBeNull(); });
    expect(result.current.order.note).toBe('Gift wrap');
  });

  it('clears the note for a new sale', () => {
    const { result } = renderSale();
    act(() => result.current.setNote('Gift wrap'));
    act(() => result.current.newSale());
    expect(result.current.order.note).toBe('');
  });
});
