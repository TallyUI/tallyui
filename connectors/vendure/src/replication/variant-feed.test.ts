import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SyncContext } from '@tallyui/core';

import { createVendureVariantFeedReplication } from './variant-feed';
import { createVendureConnector } from '../index';

const context: SyncContext = { connectorId: 'vendure', baseUrl: 'https://vendure.test', headers: {} };
const at = (ms: number) => new Date(Date.UTC(2026, 0, 1) + ms).toISOString();

type Variant = { id: string; productId: string; updatedAt: string };

/** Fake Admin API: variants and products, recording each request's query and options. */
function serve(variants: Variant[], productIds: Set<string>) {
  const requests: { query: string; options: any }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const { query, variables: { options } } = JSON.parse(init!.body as string);
    requests.push({ query, options });
    if (query.includes('productVariants')) {
      const after = options.filter?.updatedAt?.after;
      const matching = variants.filter((v) => !after || Date.parse(v.updatedAt) > Date.parse(after))
        .sort(options.sort.updatedAt === 'DESC'
          ? (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
          : (a, b) => Number(a.id) - Number(b.id));
      const skip = options.skip ?? 0;
      const items = matching.slice(skip, skip + options.take);
      return new Response(JSON.stringify({ data: { productVariants: { items, totalItems: matching.length } } }));
    }
    const items = (options.filter.id.in as string[]).filter((id) => productIds.has(id))
      .map((id) => ({ id, name: `Product ${id}`, createdAt: at(0), updatedAt: at(0), variants: [] }));
    return new Response(JSON.stringify({ data: { products: { items, totalItems: items.length } } }));
  });
  return requests;
}

describe('createVendureVariantFeedReplication', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is wired as replication.productVariantFeed and is pull-only', () => {
    const feed = createVendureConnector().replication!.productVariantFeed!;
    expect(feed.pull.handler).toBeTypeOf('function');
    expect(feed.push).toBeUndefined();
  });

  it('selects only id and updatedAt for the mark and the skew probes', async () => {
    const requests = serve([{ id: '1', productId: '1', updatedAt: at(5) }], new Set(['1']));
    await createVendureVariantFeedReplication().pull.handler({ skip: 0, updatedAt: at(1) }, 100, context);
    const heads = requests.filter((r) => r.options.sort?.updatedAt === 'DESC');
    expect(heads).toHaveLength(3);
    for (const { query } of heads) expect(query).toMatch(/items \{ id updatedAt \}/);
    expect(heads[1].options.filter.updatedAt.after).toBe(at(4));
    expect(heads[2].options.filter.updatedAt.after).toBe(at(6));
    const page = requests.find((r) => r.options.sort?.id === 'ASC')!;
    expect(page.query).toMatch(/items \{ id productId \}/);
    expect(page.options).toMatchObject({ take: 1000, skip: 0, filter: { updatedAt: { after: at(0) } } });
  });

  it('fetches parents with id in, at most 1000 ids per request, across pages in one call', async () => {
    // Page one: 1000 variants over 600 parents; page two: 900 variants over 900 new parents.
    const variants = Array.from({ length: 1900 }, (_, i) => ({
      id: String(i + 1), productId: String(i < 1000 ? Math.floor(i * 0.6) + 1 : i - 399), updatedAt: at(i),
    }));
    const parents = new Set(variants.map((v) => v.productId));
    const requests = serve(variants, parents);
    const result = await createVendureVariantFeedReplication().pull.handler(undefined, 1000, context);
    const fetches = requests.filter((r) => r.query.includes('GetProducts'));
    expect(fetches.map((r) => r.options.filter.id.in.length)).toEqual([600, 900]);
    for (const { options } of fetches) expect(options.take).toBe(options.filter.id.in.length);
    expect(new Set(result.documents.map((d) => d.id))).toEqual(parents);
    expect(result.checkpoint).toEqual({ skip: 0, updatedAt: at(1899), passHighWater: undefined, passTotal: undefined });
  });

  it('skips a changed variant whose parent was deleted', async () => {
    serve([
      { id: '1', productId: '10', updatedAt: at(1) },
      { id: '2', productId: '20', updatedAt: at(2) },
    ], new Set(['10']));
    const result = await createVendureVariantFeedReplication().pull.handler(undefined, 100, context);
    expect(result.documents.map((d) => d.id)).toEqual(['10']);
    expect(result.documents[0]).not.toHaveProperty('createdAt');
    expect(result.checkpoint).toMatchObject({ skip: 0, updatedAt: at(2) });
  });

  it('returns the checkpoint unchanged after one request when the mark has not moved', async () => {
    const requests = serve([{ id: '1', productId: '1', updatedAt: at(5) }], new Set(['1']));
    const checkpoint = { skip: 0, updatedAt: at(5) };
    const result = await createVendureVariantFeedReplication().pull.handler(checkpoint, 100, context);
    expect(result).toEqual({ documents: [], checkpoint });
    expect(requests).toHaveLength(1);
  });
});
