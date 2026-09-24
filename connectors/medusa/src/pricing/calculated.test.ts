// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { resolvePrice, type SyncContext } from '@tallyui/core';
import { startFingerprintReconcile } from '@tallyui/database';
import { medusaProductSchema, type MedusaCalculatedPrice, type MedusaProductDocument } from '../schemas/products';
import { medusaProductTraits } from '../traits/product';
import { medusaConnector } from '../index';
import { withCalculatedPrices } from './calculated';

addRxPlugin(RxDBDevModePlugin);

// A made-up key for tests only; the leak checks search for it.
const KEY = 'pk_test_not_a_real_key_0123456789';
const context: SyncContext = {
  connectorId: 'medusa', baseUrl: 'https://medusa.test', headers: { Authorization: 'Bearer admin_token' },
  pricingContext: { region_id: 'reg_eu', currency_code: 'eur', publishable_key: KEY },
};
const calc = (over: Partial<MedusaCalculatedPrice> & { type?: string | null } = {}): MedusaCalculatedPrice => {
  const { type = null, ...rest } = over;
  return {
    calculated_amount: 10, original_amount: 10, currency_code: 'eur',
    is_calculated_price_tax_inclusive: false, is_original_price_tax_inclusive: false,
    calculated_price: { price_list_id: type ? 'plist_1' : null, price_list_type: type }, ...rest,
  };
};
const doc = (id: string, variantIds: string[]): MedusaProductDocument => ({
  id, status: 'published', variants: variantIds.map((v) => ({ id: v, prices: [{ amount: 10, currency_code: 'eur' }] })),
});

afterEach(() => vi.restoreAllMocks());

describe('withCalculatedPrices', () => {
  it('asks the store API in id[] chunks of 100, with region_id, the fields and the key header, and no Authorization', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ products: [], count: 0 })));
    const docs = Array.from({ length: 250 }, (_, i) => doc(`prod_${i}`, [`v_${i}`]));
    await withCalculatedPrices(docs, context);

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const urls = fetchSpy.mock.calls.map((c) => new URL(String(c[0])));
    expect(urls.map((u) => u.searchParams.getAll('id[]').length)).toEqual([100, 100, 50]);
    expect(urls.flatMap((u) => u.searchParams.getAll('id[]'))).toEqual(docs.map((d) => d.id));
    for (const url of urls) {
      expect(url.origin + url.pathname).toBe('https://medusa.test/store/products');
      expect(url.searchParams.get('region_id')).toBe('reg_eu');
      expect(url.searchParams.get('limit')).toBe('100');
      expect(url.searchParams.get('fields')).toBe('id,*variants.calculated_price');
    }
    for (const [, init] of fetchSpy.mock.calls) {
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers).toEqual({ 'x-publishable-api-key': KEY, 'Content-Type': 'application/json' });
      expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain('authorization');
    }
  });

  it('sets each variant\'s calculated_price as returned, and null for an unlisted product or variant', async () => {
    const priced = calc({ calculated_amount: 8, type: 'sale' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      products: [{ id: 'prod_a', variants: [{ id: 'v_a1', calculated_price: priced }] }], count: 1,
    })));
    const [a, b] = await withCalculatedPrices([doc('prod_a', ['v_a1', 'v_a2']), doc('prod_b', ['v_b1'])], context);
    expect(a!.variants!.map((v) => v.calculated_price)).toEqual([priced, null]);
    expect(b!.variants!.map((v) => v.calculated_price)).toEqual([null]);
    expect(a!.variants![0]!.prices).toEqual([{ amount: 10, currency_code: 'eur' }]);
  });

  it('without a pricing context, returns the documents unchanged and makes no request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const docs = [doc('prod_a', ['v_a1'])];
    const { pricingContext: _, ...baseOnly } = context;
    const result = await withCalculatedPrices(docs, baseOnly);
    expect(result).toBe(docs);
    expect(result[0]!.variants![0]).not.toHaveProperty('calculated_price');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws on a non-OK store response with the status and Medusa\'s message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: 'region not found' }), { status: 400 }));
    await expect(withCalculatedPrices([doc('prod_a', ['v_a1'])], context)).rejects.toThrow('Medusa store API error: 400: region not found');
  });
});

describe('the publishable key never leaks', () => {
  it('appears in no store-API error, no runner lastError and no console call, even when Medusa echoes it', async () => {
    const consoles = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ message: `Publishable API key ${KEY} is revoked` }), { status: 400 }));

    const direct = await withCalculatedPrices([doc('prod_a', ['v_a1'])], context).catch((e: Error) => e);
    expect(direct).toBeInstanceOf(Error);
    expect(String((direct as Error).message)).toContain('400');

    const db = await createRxDatabase({
      name: `medusakeyleak${Date.now()}`, multiInstance: false, storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    });
    await db.addCollections({ products: { schema: medusaProductSchema } });
    // startDelayMs 0: the timer path, which logs the failure with console.warn.
    const runner = startFingerprintReconcile({
      collection: db.products, adapter: medusaConnector.reconcile!.calculatedPrices!, context, reSync: () => {}, startDelayMs: 0,
    });
    const state = await new Promise<{ lastError?: unknown }>((resolve) => {
      runner.state$.subscribe((s) => { if (s.lastError) resolve(s); });
    });
    runner.stop();
    await db.close();

    const texts = [
      String((direct as Error).message), String((direct as Error).stack),
      String((state.lastError as Error).message), String((state.lastError as Error).stack),
      ...consoles.flatMap((spy) => spy.mock.calls.flat().map((arg) => (arg instanceof Error ? `${arg.message} ${arg.stack}` : String(arg)))),
    ];
    expect(consoles.some((spy) => spy.mock.calls.length > 0)).toBe(true);
    for (const text of texts) expect(text).not.toContain(KEY);
  });
});

describe('Medusa price traits in priced mode', () => {
  const product = (calculated_price: MedusaCalculatedPrice | null | undefined, status = 'published') => ({
    status,
    variants: [{
      id: 'v1', prices: [{ amount: 10, currency_code: 'eur', price_list_id: null }],
      ...(calculated_price === undefined ? {} : { calculated_price }),
    }],
  });

  it('a sale gives the original as base and the calculated amount as sale, with its tax flags', () => {
    const doc = product(calc({ calculated_amount: 8, original_amount: 10, type: 'sale', is_calculated_price_tax_inclusive: true }));
    expect(medusaProductTraits.getPrices(doc)).toStrictEqual([
      { amount: 1000, currency: 'EUR', kind: 'base', taxInclusive: false },
      { amount: 800, currency: 'EUR', kind: 'sale', taxInclusive: true },
    ]);
    expect(resolvePrice(medusaProductTraits.getPrices(doc), 'EUR')).toEqual({
      current: { amount: 800, currency: 'EUR', taxInclusive: true }, was: { amount: 1000, currency: 'EUR', taxInclusive: false },
    });
  });

  it('a sale list priced at or above the original adds no sale', () => {
    expect(medusaProductTraits.getPrices(product(calc({ calculated_amount: 12, original_amount: 10, type: 'sale' }))))
      .toStrictEqual([{ amount: 1000, currency: 'EUR', kind: 'base', taxInclusive: false }]);
  });

  it('an override replaces the base price, with no sale', () => {
    expect(medusaProductTraits.getPrices(product(calc({ calculated_amount: 7, original_amount: 10, type: 'override' }))))
      .toStrictEqual([{ amount: 700, currency: 'EUR', kind: 'base', taxInclusive: false }]);
  });

  it('with no price list, the base is the original amount in the context currency, never the admin prices', () => {
    expect(medusaProductTraits.getPrices(product(calc({ calculated_amount: 11, original_amount: 11, currency_code: 'usd' }))))
      .toStrictEqual([{ amount: 1100, currency: 'USD', kind: 'base', taxInclusive: false }]);
  });

  it('null gives no price and is not sellable; base-only reads the admin prices as before', () => {
    expect(medusaProductTraits.getPrices(product(null))).toEqual([]);
    expect(medusaProductTraits.getVariants!(product(null))[0]!.prices).toEqual([]);
    expect(medusaProductTraits.isSellable(product(null))).toBe(false);
    expect(medusaProductTraits.getPrices(product(undefined))).toStrictEqual([{ amount: 1000, currency: 'EUR', kind: 'base' }]);
    expect(medusaProductTraits.isSellable(product(undefined))).toBe(true);
  });

  it('is sellable in priced mode when at least one variant has a calculated price, and never when a draft', () => {
    const mixed = { status: 'published', variants: [{ id: 'v1', calculated_price: null }, { id: 'v2', calculated_price: calc() }] };
    expect(medusaProductTraits.isSellable(mixed)).toBe(true);
    expect(medusaProductTraits.isSellable(product(calc(), 'draft'))).toBe(false);
  });
});

describe('the Medusa schema stores calculated_price without a schema change', () => {
  it('accepts variants carrying a full calculated_price object, and null', async () => {
    const db = await createRxDatabase({
      name: `medusacalcschema${Date.now()}`, multiInstance: false,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    });
    await db.addCollections({ products: { schema: medusaProductSchema } });
    const full = { ...calc({ calculated_amount: 8, type: 'sale' }), id: 'pset_1', original_price: { id: 'price_1' } };
    const base = { handle: 'h', status: 'published' };
    await db.products.insert({ ...base, id: 'prod_full', handle: 'full', variants: [{ id: 'v1', prices: [], calculated_price: full }] });
    await db.products.insert({ ...base, id: 'prod_null', handle: 'null', variants: [{ id: 'v2', prices: [], calculated_price: null }] });
    const stored = await db.products.findByIds(['prod_full', 'prod_null']).exec();
    expect(stored.get('prod_full')!.toJSON().variants[0].calculated_price).toEqual(full);
    expect(stored.get('prod_null')!.toJSON().variants[0].calculated_price).toBeNull();
    await db.close();
  });
});
