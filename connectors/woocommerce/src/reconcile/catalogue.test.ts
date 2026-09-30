// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { ConnectorUnauthorizedError } from '@tallyui/core';
import { closeTills, context, createFakeStore } from '../__tests__/fake-store';
import { WooMissingUuidError, wooCatalogueReconcile, wooReconcileFingerprint } from '../index';
import { wooBulkListingUrl, wooHasIdFastPath } from './catalogue';
import { createWooReconcileFeed, wooFetchByIds } from './feed';

afterEach(closeTills);

const pages = async (adapter: ReturnType<typeof wooCatalogueReconcile>, from?: number) => {
  const out: Array<{ entries: unknown[]; cursor: number }> = [];
  for await (const page of adapter.fetchPages(context, from)) out.push(page as { entries: unknown[]; cursor: number });
  return out;
};

describe('wooCatalogueReconcile listing', () => {
  it('pages the published catalogue by id with _fields, no modified_after; the cursor is the next page', async () => {
    const store = createFakeStore(250);
    store.row(3).status = 'draft';
    const listed = await pages(wooCatalogueReconcile(createWooReconcileFeed()));
    // First the status read, as an empty page so that it takes its own budget slot.
    expect(listed.map((p) => [p.entries.length, p.cursor])).toEqual([[0, 1], [100, 2], [100, 3], [49, 4]]);
    expect(listed[1].entries[0]).toEqual({ key: 'u1', fingerprint: '2026-01-01T08:00:01|10|instock', remote: 1 });
    expect(store.requests[0].pathname).toBe('/wp-json/wcpos/v2/status');
    expect(Object.fromEntries(store.requests[1].searchParams)).toEqual({
      per_page: '100', page: '1', orderby: 'id', order: 'asc', status: 'publish',
      _fields: 'id,uuid,date_modified_gmt,stock_quantity,stock_status',
    });
    expect(store.requests.some((url) => url.searchParams.has('modified_after'))).toBe(false);
  });

  it('resumes from a cursor, and stops on an empty page', async () => {
    const store = createFakeStore(200);
    const listed = await pages(wooCatalogueReconcile(createWooReconcileFeed()), 2);
    expect(listed.map((p) => [p.entries.length, p.cursor])).toEqual([[0, 2], [100, 3], [0, 4]]);
    expect(store.requests.map((url) => url.searchParams.get('page'))).toEqual([null, '2', '3']);
  });

  it('a listed row without a uuid throws WooMissingUuidError; a 401 throws ConnectorUnauthorizedError', async () => {
    const store = createFakeStore(2);
    delete store.row(2).uuid;
    await expect(pages(wooCatalogueReconcile(createWooReconcileFeed()))).rejects.toBeInstanceOf(WooMissingUuidError);
    store.respond = () => new Response('no', { status: 401 });
    await expect(pages(wooCatalogueReconcile(createWooReconcileFeed()))).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
  });

  it('the fingerprint is the (date_modified_gmt, stock_quantity, stock_status) tuple', () => {
    const doc = { date_modified_gmt: '2026-01-01T08:00:00', stock_quantity: 3, stock_status: 'instock' };
    expect(wooReconcileFingerprint(doc)).toBe('2026-01-01T08:00:00|3|instock');
    expect(wooReconcileFingerprint({ ...doc, stock_quantity: 2 })).not.toBe(wooReconcileFingerprint(doc));
    expect(wooReconcileFingerprint({ date_modified_gmt: 'x', stock_quantity: null })).toBe('x||');
  });
});

describe('wooCatalogueReconcile confirmGone', () => {
  it('re-reads by numeric id with status=any: absent, trashed and unpublished are gone; published is kept', async () => {
    const store = createFakeStore(4);
    store.row(2).status = 'trash';
    store.row(3).status = 'draft';
    store.rows.splice(3, 1); // 4 deleted
    const locals = [1, 2, 3, 4].map((n) => ({ uuid: `u${n}`, id: n }));
    expect(await wooCatalogueReconcile(createWooReconcileFeed()).confirmGone(locals, context)).toEqual(['u2', 'u3', 'u4']);
    expect(Object.fromEntries(store.requests[0].searchParams)).toEqual({ include: '1,2,3,4', per_page: '100', status: 'any', _fields: 'id,uuid,status' });
  });

  it('a request error rejects, so nothing is confirmed', async () => {
    const store = createFakeStore(1);
    store.respond = () => new Response('down', { status: 500 });
    await expect(wooCatalogueReconcile(createWooReconcileFeed()).confirmGone([{ uuid: 'u1', id: 1 }], context)).rejects.toThrow('500');
  });
});

describe('wooFetchByIds', () => {
  it('fetches full documents by numeric id (local id, else remote), 100 per request, with status=any', async () => {
    const store = createFakeStore(150);
    const docs = await wooFetchByIds(store.rows.map((r) => (r.id % 2 ? { key: r.uuid!, local: { id: r.id } } : { key: r.uuid!, remote: r.id })), context);
    expect(docs).toHaveLength(150);
    expect(docs[0]).toMatchObject({ uuid: 'u1', name: 'Product 1', _deleted: false });
    expect(store.requests.map((url) => url.searchParams.get('include')!.split(',').length)).toEqual([100, 50]);
    expect(store.requests[0].searchParams.get('status')).toBe('any');
    expect(store.requests[0].searchParams.has('_fields')).toBe(false);
  });

  it('a fetched draft stays deleted: the feed delivers it as _deleted: true', async () => {
    const store = createFakeStore(3);
    store.row(3).status = 'draft';
    const feed = createWooReconcileFeed();
    feed.enqueue([{ key: 'u3', local: { uuid: 'u3', id: 3, status: 'publish' } }]);
    const { documents } = await feed.adapter.pull.handler(undefined, 10, context);
    expect(documents).toEqual([expect.objectContaining({ uuid: 'u3', status: 'draft', _deleted: true })]);
  });

  it('applies the pull\'s uuid check', async () => {
    const store = createFakeStore(2);
    delete store.row(2).uuid;
    await expect(wooFetchByIds([{ key: 'u2', remote: 2 }], context)).rejects.toBeInstanceOf(WooMissingUuidError);
  });
});

describe('the bulk-id fast path switch (wcpos/woocommerce-pos#2113)', () => {
  it('reads wcpos/v2/status: only capabilities including products_id_fast_path turn it on; a missing field is off', async () => {
    const store = createFakeStore(1);
    expect(await wooHasIdFastPath(context)).toBe(false);
    store.capabilities = ['something_else'];
    expect(await wooHasIdFastPath(context)).toBe(false);
    store.capabilities = ['products_id_fast_path'];
    expect(await wooHasIdFastPath(context)).toBe(true);
    expect(store.requests.map((url) => url.pathname)).toEqual(Array(3).fill('/wp-json/wcpos/v2/status'));
  });

  it.each([[undefined], [['products_id_fast_path']]])('capabilities %j: one status read per pass, then (stub) the paged listing', async (capabilities) => {
    const store = createFakeStore(3);
    store.capabilities = capabilities;
    const listed = await pages(wooCatalogueReconcile(createWooReconcileFeed()));
    expect(listed.map((p) => p.entries.length)).toEqual([0, 3]);
    expect(store.requests.map((url) => url.pathname.split('/').pop())).toEqual(['status', 'products']);
  });

  it('the request builder pins the recorded contract', () => {
    expect(wooBulkListingUrl(context.baseUrl)).toBe(
      `${context.baseUrl}/products?per_page=-1&fields%5B%5D=id&fields%5B%5D=date_modified_gmt&fields%5B%5D=stock_quantity&fields%5B%5D=stock_status`,
    );
  });
});
