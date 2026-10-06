// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError } from '@tallyui/core';
import { createTallyDatabase } from '@tallyui/database';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { context } from '../__tests__/fake-store';
import listAll from '../__tests__/fixtures/coupons-1.10.20/list-all.raw.json';
import fieldsTrimmed from '../__tests__/fixtures/coupons-1.10.20/fields-trimmed.raw.json';
import includeAny from '../__tests__/fixtures/coupons-1.10.20/include-status-any.raw.json';
import includeDefault from '../__tests__/fixtures/coupons-1.10.20/include-default.raw.json';
import { createWooCommerceConnector, createWooCouponFeed, toCouponDocument, wooCouponFingerprint, wooCouponReconcile, wooCouponSchema } from '../index';
import { wooFetchCouponsByIds } from './coupons';

afterEach(() => vi.restoreAllMocks());

const pages = async (adapter: ReturnType<typeof wooCouponReconcile>, from?: number) => {
  const out = [];
  for await (const page of adapter.fetchPages(context, from)) out.push(page);
  return out;
};

describe('WooCommerce coupons', () => {
  it('the fingerprint is date_modified_gmt|usage_count|used_by, and ids as numbers or strings match', () => {
    const coupon = { date_modified_gmt: 'x', usage_count: 1, used_by: ['a@b.invalid'] };
    expect(wooCouponFingerprint(coupon)).toBe('x|1|["a@b.invalid"]');
    expect(wooCouponFingerprint({ ...coupon, usage_count: 2 })).not.toBe(wooCouponFingerprint(coupon));
    expect(wooCouponFingerprint({ ...coupon, used_by: ['c@d.invalid'] })).not.toBe(wooCouponFingerprint(coupon));
    expect(wooCouponFingerprint({ used_by: [7] })).toBe(wooCouponFingerprint({ used_by: ['7'] }));
    expect(wooCouponFingerprint({})).toBe('||[]');
  });

  it('each captured coupon fingerprints the same as a listing row and as a stored document', () => {
    for (const row of listAll) {
      expect(wooCouponFingerprint(row)).toBe(wooCouponFingerprint(toCouponDocument(row)));
    }
  });

  it('toCouponDocument keys on the uuid meta, keeps only schema fields, and a draft arrives deleted', () => {
    const row = includeDefault.find((coupon) => coupon.id === 262)!;
    const doc = toCouponDocument(row);
    expect(doc.uuid).toBe('13542ab4-dcab-47a5-9c38-de590a7c59f3');
    expect(doc.id).toBe(262);
    expect(doc._deleted).toBe(false);
    expect(doc).not.toHaveProperty('_links');
    expect(doc).not.toHaveProperty('_rxdb_revision');
    expect(toCouponDocument(includeAny.find((coupon) => coupon.id === 266)!)._deleted).toBe(true);
    expect(toCouponDocument({ ...row, meta_data: [] })).toBeUndefined();
  });

  it('the listing pages the published coupons by id with _fields', async () => {
    const requests: URL[] = [];
    const firstPage = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, date_modified_gmt: 'x', usage_count: 0, used_by: [] }));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      expect(url.pathname).toBe('/wp-json/wcpos/v2/coupons');
      return Response.json(url.searchParams.get('page') === '1' ? firstPage : fieldsTrimmed);
    });
    const adapter = wooCouponReconcile(createWooCouponFeed());
    const listed = await pages(adapter);
    expect(listed.map((page) => [page.entries.length, page.cursor])).toEqual([[100, 2], [10, 3]]);
    expect(requests[0].pathname.endsWith('/coupons')).toBe(true);
    expect(Object.fromEntries(requests[0].searchParams)).toEqual({
      per_page: '100', page: '1', orderby: 'id', order: 'asc', status: 'publish',
      _fields: 'id,date_modified_gmt,usage_count,used_by',
    });
    expect(requests.some((url) => url.searchParams.has('modified_after'))).toBe(false);
    requests.length = 0;
    await pages(adapter, 2);
    expect(requests[0].searchParams.get('page')).toBe('2');
    expect(requests.some((url) => url.searchParams.has('modified_after'))).toBe(false);
  });

  it('a listing row without an integer id is dropped, and a 401 throws ConnectorUnauthorizedError', async () => {
    const requests: URL[] = [];
    let unauthorized = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      expect(url.pathname).toBe('/wp-json/wcpos/v2/coupons');
      return unauthorized ? new Response('no', { status: 401 }) : Response.json([
        fieldsTrimmed[0], { id: '262' }, { id: 2.5 }, {},
      ]);
    });
    const adapter = wooCouponReconcile(createWooCouponFeed());
    const listed = await pages(adapter);
    expect(listed[0].entries).toEqual([{
      key: String(fieldsTrimmed[0].id), fingerprint: wooCouponFingerprint(fieldsTrimmed[0]), remote: fieldsTrimmed[0].id,
    }]);
    unauthorized = true;
    await expect(pages(adapter)).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
    expect(requests).toHaveLength(2);
  });

  it('confirmGone asks the published listing by id: a draft, a trashed and a re-keyed coupon are gone; one without an id is kept', async () => {
    const requests: URL[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      expect(url.pathname).toBe('/wp-json/wcpos/v2/coupons');
      expect(url.searchParams.has('include')).toBe(true);
      return Response.json(includeDefault);
    });
    const published = toCouponDocument(includeDefault[0]);
    const draft = toCouponDocument(includeAny.find((coupon) => coupon.id === 266)!);
    const locals = [published, draft, { id: 267, uuid: 'trashed' }, { uuid: 'no-id' }, { id: 262, uuid: 'stale' }];
    const adapter = wooCouponReconcile(createWooCouponFeed());
    expect(await adapter.confirmGone(locals, context)).toEqual([draft.uuid, 'trashed', 'stale']);
    expect(requests).toHaveLength(1);
    expect(Object.fromEntries(requests[0].searchParams)).toEqual({
      include: '262,266,267,262', per_page: '100', _fields: 'id,meta_data',
    });
    expect(requests[0].searchParams.has('status')).toBe(false);
    requests.length = 0;
    expect(await adapter.confirmGone([], context)).toEqual([]);
    expect(requests).toHaveLength(0);
  });

  it('the feed refetches by id with status=any, in chunks of 100, and a draft arrives deleted', async () => {
    const requests: URL[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      expect(url.pathname).toBe('/wp-json/wcpos/v2/coupons');
      expect(url.searchParams.get('status')).toBe('any');
      const ids = url.searchParams.get('include')!.split(',').map(Number);
      return Response.json(includeAny.filter((row) => ids.includes(row.id)));
    });
    const docs = await wooFetchCouponsByIds([{ key: '262', local: { id: 262 } }, { key: '266', remote: 266 }], context);
    expect(docs).toHaveLength(2);
    expect(docs.find((doc) => doc.id === 266)._deleted).toBe(true);
    expect(Object.fromEntries(requests[0].searchParams)).toEqual({ include: '262,266', per_page: '100', status: 'any' });
    requests.length = 0;
    await wooFetchCouponsByIds(Array.from({ length: 150 }, (_, i) => ({ key: String(i + 1), remote: i + 1 })), context);
    expect(requests).toHaveLength(2);
    expect(requests.map((url) => url.searchParams.get('include')!.split(',').length)).toEqual([100, 50]);
  });

  it('the connector wires coupons: schema, pull and reconcile', () => {
    const connector = createWooCommerceConnector();
    expect(connector.schemas.coupons).toBe(wooCouponSchema);
    expect(connector.replication?.coupons?.pull?.handler).toBeTypeOf('function');
    expect(connector.reconcile?.coupons?.refetchBatchSize).toBe(100);
    expect(connector.reconcile?.catalogue).toBeDefined();
  });

  it('the coupons collection stores every captured coupon and finds one by code', async () => {
    const db = await createTallyDatabase({
      connector: createWooCommerceConnector(),
      name: `coupons_test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      storage: getRxStorageMemory(),
    });
    try {
      expect(db.collections.coupons).toBeDefined();
      const documents = listAll.filter((row) => row.status === 'publish').map((row) => {
        const { _deleted, ...doc } = toCouponDocument(row);
        return doc;
      });
      const inserted = await db.collections.coupons.bulkInsert(documents);
      expect(inserted.error).toEqual([]);
      expect(inserted.success).toHaveLength(documents.length);
      const coupon = await db.collections.coupons.findOne({ selector: { code: 'cap-percent' } }).exec();
      expect(coupon?.uuid).toBe('13542ab4-dcab-47a5-9c38-de590a7c59f3');
    } finally {
      await db.remove();
    }
  });
});
