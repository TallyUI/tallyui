import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SyncContext } from '@tallyui/core';
import type { MedusaCalculatedPrice } from '../schemas/products';
import { withCalculatedPrices } from '../pricing/calculated';
import { fetchPages, fingerprint, MEDUSA_CALCULATED_PRICE_RECONCILE_INTERVAL_MS } from './calculated-prices';

const KEY = 'pk_test_not_a_real_key_0123456789';
const context: SyncContext = {
  connectorId: 'medusa', baseUrl: 'https://medusa.test', headers: { Authorization: 'Bearer admin_token' },
  pricingContext: { region_id: 'reg_eu', currency_code: 'eur', publishable_key: KEY },
};
const calc = (amount: number, type: string | null = null): MedusaCalculatedPrice => ({
  calculated_amount: amount, original_amount: 10, currency_code: 'eur',
  is_calculated_price_tax_inclusive: false, is_original_price_tax_inclusive: true,
  calculated_price: { price_list_id: type ? 'plist_1' : null, price_list_type: type },
});

afterEach(() => vi.restoreAllMocks());

describe('calculated-price fetchPages', () => {
  it('pages the store API by offset in id order, 100 per page, until count, with the key and no Authorization', async () => {
    const product = (n: number) => ({ id: `prod_${n}`, variants: [{ id: `v_${n}`, calculated_price: calc(8, 'sale') }] });
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ products: Array.from({ length: 100 }, (_, i) => product(i)), count: 150 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ products: Array.from({ length: 50 }, (_, i) => product(100 + i)), count: 150 })));

    const pages: Array<Map<string, string>> = [];
    for await (const page of fetchPages(context)) pages.push(page);

    expect(pages.map((p) => p.size)).toEqual([100, 50]);
    expect(pages[0]!.get('prod_0')).toBe('v_0:eur:8:10:false:true:sale');
    const urls = fetchSpy.mock.calls.map((c) => new URL(String(c[0])));
    expect(urls.map((u) => u.searchParams.get('offset'))).toEqual(['0', '100']);
    for (const url of urls) {
      expect(url.pathname).toBe('/store/products');
      expect(Object.fromEntries(url.searchParams)).toMatchObject({
        region_id: 'reg_eu', limit: '100', order: 'id', fields: 'id,*variants.calculated_price',
      });
    }
    for (const [, init] of fetchSpy.mock.calls) {
      expect((init as RequestInit).headers).toEqual({ 'x-publishable-api-key': KEY, 'Content-Type': 'application/json' });
    }
  });

  it('without a pricing context, yields nothing and makes no request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { pricingContext: _, ...baseOnly } = context;
    const pages: unknown[] = [];
    for await (const page of fetchPages(baseOnly)) pages.push(page);
    expect(pages).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('calculated-price fingerprint', () => {
  it('is equal for the store row and the local document the enrichment built from it', async () => {
    const storeRow = { id: 'prod_1', variants: [
      { id: 'v_b', calculated_price: calc(8, 'sale') },
      { id: 'v_a', calculated_price: calc(10) },
    ] };
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ products: [storeRow], count: 1 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ products: [storeRow], count: 1 })));
    const [remote] = await (async () => { const out: Map<string, string>[] = []; for await (const p of fetchPages(context)) out.push(p); return out; })();
    // The local document is built in admin order (sorted by id), with a variant the store did not price.
    const [local] = await withCalculatedPrices([{ id: 'prod_1', variants: [{ id: 'v_a' }, { id: 'v_b' }] }], context);
    expect(fingerprint(local!)).toBe(remote!.get('prod_1'));
    expect(fingerprint(local!)).toBe('v_a:eur:10:10:false:true:|v_b:eur:8:10:false:true:sale');
  });

  it('ignores variant order, and marks a null or missing calculated price with ":-"', () => {
    const a = { id: 'p', variants: [{ id: 'v1', calculated_price: calc(8, 'sale') }, { id: 'v2', calculated_price: null }, { id: 'v3' }] };
    const b = { id: 'p', variants: [{ id: 'v3' }, { id: 'v2', calculated_price: null }, { id: 'v1', calculated_price: calc(8, 'sale') }] };
    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(fingerprint(a)).toBe('v1:eur:8:10:false:true:sale|v2:-|v3:-');
  });

  it('changes with the amount, the tax flags and the list type', () => {
    const base = fingerprint({ id: 'p', variants: [{ id: 'v1', calculated_price: calc(8, 'sale') }] });
    expect(fingerprint({ id: 'p', variants: [{ id: 'v1', calculated_price: calc(7, 'sale') }] })).not.toBe(base);
    expect(fingerprint({ id: 'p', variants: [{ id: 'v1', calculated_price: calc(8, 'override') }] })).not.toBe(base);
    expect(fingerprint({ id: 'p', variants: [{ id: 'v1', calculated_price: { ...calc(8, 'sale'), is_calculated_price_tax_inclusive: true } }] })).not.toBe(base);
  });
});

describe('MEDUSA_CALCULATED_PRICE_RECONCILE_INTERVAL_MS', () => {
  it('is 30 minutes', () => {
    expect(MEDUSA_CALCULATED_PRICE_RECONCILE_INTERVAL_MS).toBe(30 * 60 * 1000);
  });
});
