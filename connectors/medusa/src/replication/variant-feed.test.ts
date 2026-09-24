import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SyncContext } from '@tallyui/core';

import { createMedusaVariantFeedReplication } from './variant-feed';
import { MEDUSA_PRODUCT_FIELDS } from './products';
import { createMedusaVariantFeedReplication as exported, medusaConnector } from '../index';

const signal = new AbortController().signal;
const context: SyncContext = { connectorId: 'medusa', baseUrl: 'https://medusa.test', headers: { Authorization: 'Bearer test_token' }, signal };
const MARK = '2026-01-02T00:00:00.000Z';

/** Fake Admin API: one changed variant of prod_1, recording every request URL and init. */
function serve(status = 200) {
  const calls: { url: URL; init: RequestInit }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, init: init! });
    if (status !== 200) return new Response(JSON.stringify({ message: 'Unauthorized' }), { status });
    if (url.pathname === '/admin/product-variants') {
      return new Response(JSON.stringify({ variants: [{ id: 'variant_1', product_id: 'prod_1', updated_at: MARK }], count: 1 }));
    }
    return new Response(JSON.stringify({ products: [{ id: 'prod_1', handle: 'p1', status: 'published', extra: true }], count: 1 }));
  });
  return calls;
}

describe('createMedusaVariantFeedReplication', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is pull-only and runs inside the connector\'s combined replication.products', () => {
    expect(createMedusaVariantFeedReplication().push).toBeUndefined();
    expect(medusaConnector.replication!.products!.push).toBeUndefined();
    expect(exported).toBe(createMedusaVariantFeedReplication);
  });

  it('reads the mark with only id and updated_at, then pages by id with fields=id,product_id and no filter on a first pass', async () => {
    const calls = serve();
    const result = await createMedusaVariantFeedReplication().pull.handler(undefined, 100, context);
    const [mark, page, parents] = calls.map((c) => c.url);
    expect(mark.pathname).toBe('/admin/product-variants');
    expect(Object.fromEntries(mark.searchParams)).toEqual({ limit: '1', order: '-updated_at', fields: 'id,updated_at' });
    expect(page.pathname).toBe('/admin/product-variants');
    expect(Object.fromEntries(page.searchParams)).toEqual({ limit: '1000', offset: '0', order: 'id', fields: 'id,product_id' });
    expect(parents.pathname).toBe('/admin/products');
    expect(parents.searchParams.getAll('id[]')).toEqual(['prod_1']);
    expect(parents.searchParams.get('fields')).toBe(MEDUSA_PRODUCT_FIELDS);
    expect(result.documents).toEqual([{ id: 'prod_1', handle: 'p1', status: 'published', _deleted: false }]);
    expect(result.checkpoint).toEqual({ offset: 0, updated_at: MARK, pass_mark: undefined, pass_count: undefined });
  });

  it('filters pages with updated_at[$gte], never [gte], and sends the connector headers and signal', async () => {
    const calls = serve();
    await createMedusaVariantFeedReplication(50).pull.handler({ offset: 0, updated_at: '2026-01-01T00:00:00.000Z' }, 100, context);
    const page = calls[1].url;
    expect(page.searchParams.get('updated_at[$gte]')).toBe('2026-01-01T00:00:00.000Z');
    expect(page.searchParams.get('limit')).toBe('50');
    expect(page.searchParams.get('fields')).toBe('id,product_id');
    expect(page.search).toContain('updated_at%5B%24gte%5D=');
    expect(page.search).not.toContain('updated_at%5Bgte%5D');
    for (const { init } of calls) {
      expect(init.headers).toMatchObject({ Authorization: 'Bearer test_token' });
      expect(init.signal).toBe(signal);
    }
  });

  it('returns the checkpoint unchanged after one request when the mark has not moved', async () => {
    const calls = serve();
    const checkpoint = { offset: 0, updated_at: MARK };
    const result = await createMedusaVariantFeedReplication().pull.handler(checkpoint, 100, context);
    expect(result).toEqual({ documents: [], checkpoint });
    expect(calls).toHaveLength(1);
  });

  it('throws with Medusa\'s message on a non-OK response', async () => {
    serve(401);
    await expect(createMedusaVariantFeedReplication().pull.handler(undefined, 100, context))
      .rejects.toThrow('Medusa API error: 401: Unauthorized');
  });
});
