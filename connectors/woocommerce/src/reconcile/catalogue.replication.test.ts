// @vitest-environment node
// The eight planted missed-edit cases (#248): each plants a miss in the fake store (a model, see its header),
// shows the incremental pull alone missing it, then runs one catalogue reconcile pass beside the real
// replication and a poll, and shows the till corrected. Every change reaches the till through the pull.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startCatalogueReconcile, type CatalogueReconcileEvent } from '@tallyui/database';
import { at, closeTills, context, createFakeStore, stamp, startTill, type FakeRow, type FakeStore } from '../__tests__/fake-store';
import { createWooCommerceConnector } from '../index';
import { wooProductReplication } from '../replication/products';

afterEach(closeTills);

type Till = Awaited<ReturnType<typeof startTill>>;

/** One pass, started by hand: the runner's timers never fire, so no check or retry runs on its own. */
async function reconcile(till: Till, syncContext = context) {
  const events: CatalogueReconcileEvent[] = [];
  const runner = startCatalogueReconcile({
    collection: till.collection, adapter: till.connector.reconcile!.catalogue!, context: syncContext,
    reSync: () => till.state.reSync(), setTimer: () => () => {}, log: (event) => events.push(event),
  });
  runner.reconcile();
  await vi.waitFor(() => expect(events.some((e) => ['pass-completed', 'stopped', 'skipped'].includes(e.type))).toBe(true), { timeout: 5_000, interval: 10 });
  runner.stop();
  await new Promise((resolve) => setTimeout(resolve, 30));
  await till.sync();
  return events;
}
const keysOf = (events: CatalogueReconcileEvent[], type: 'refetched' | 'tombstoned') =>
  events.flatMap((e) => (e.type === type ? e.keys : []));
const nameOf = async (till: Till, uuid: string) => (await till.local()).get(uuid)?.name;

async function tillOf(store: FakeStore, options: Parameters<typeof startTill>[1] = { batchSize: 100 }) {
  const till = await startTill(store, options);
  await till.sync();
  expect((await till.local()).size).toBe(store.rows.length);
  return till;
}

describe('WooCommerce catalogue reconcile: planted missed-edit cases', () => {
  it('1. an edit inside the spring-forward hour (#247), store at America/New_York', async () => {
    // Products at 02:21..02:30 GMT on 8 March 2026. The mark L = 02:30:00: as New York digits that is inside the
    // gap (02:00-03:00 local), so PHP reads the bound as 03:30 and an edit at 02:45 GMT is filtered out.
    const store = createFakeStore(10, { zone: 'America/New_York', stamp: (n) => `2026-03-08T02:${20 + n}:00` });
    const till = await tillOf(store);
    store.edit(3, { name: 'Edited' }, '2026-03-08T02:45:00');
    await till.poll();
    expect(await nameOf(till, 'u3')).toBe('Product 3');

    expect(keysOf(await reconcile(till), 'refetched')).toEqual(['u3']);
    await till.poll();
    expect(await nameOf(till, 'u3')).toBe('Edited');
  });

  it('2. an over-excluding filter (#247): the edit is lost for good once a later edit moves the mark', async () => {
    const store = createFakeStore(10);
    const till = await tillOf(store);
    store.overExclude = (r) => r.date_modified_gmt >= '2026-01-01T09:00:00' && r.date_modified_gmt < '2026-01-01T10:00:00';
    store.edit(2, { name: 'Lost' }, '2026-01-01T09:30:00');
    store.edit(5, { name: 'Later' }, '2026-01-01T10:30:00');
    await till.poll();
    expect([await nameOf(till, 'u2'), await nameOf(till, 'u5')]).toEqual(['Product 2', 'Later']);

    expect(keysOf(await reconcile(till), 'refetched')).toEqual(['u2']);
    await till.poll();
    expect(await nameOf(till, 'u2')).toBe('Lost');
  });

  it('3. a same-second edit after the mark (#234)', async () => {
    const store = createFakeStore(10);
    const till = await tillOf(store);
    store.edit(4, { name: 'Same second' }, stamp(10)); // the mark's own second
    await till.poll();
    expect(await nameOf(till, 'u4')).toBe('Product 4');

    expect(keysOf(await reconcile(till), 'refetched')).toEqual(['u4']);
    await till.poll();
    expect(await nameOf(till, 'u4')).toBe('Same second');
  });

  it('4. a deletion without X-WP-Total shifts a neighbour (#240): the skipped edit arrives, the deleted product goes', async () => {
    let armed = false;
    const store = createFakeStore(6, { total: false });
    const till = await tillOf(store, {
      batchSize: 2,
      afterCall: (_call, rows) => { if (armed) { armed = false; rows.splice(rows.findIndex((r) => r.id === 1), 1); } },
    });
    for (const row of [...store.rows]) store.edit(row.id, { name: `Edited ${row.id}` }, stamp(20 + row.id));
    armed = true; // product 1 is deleted after the pass's first page (1, 2): offset 2 then returns 4 and 5
    await till.poll();
    const synced = await till.local();
    expect([2, 3, 4, 5, 6].map((n) => synced.get(`u${n}`)?.name)).toEqual(['Edited 2', 'Product 3', 'Edited 4', 'Edited 5', 'Edited 6']);
    expect(synced.has('u1')).toBe(true);

    const events = await reconcile(till);
    expect([keysOf(events, 'refetched'), keysOf(events, 'tombstoned')]).toEqual([['u3'], ['u1']]);
    await till.poll();
    expect(await nameOf(till, 'u3')).toBe('Edited 3');
    expect((await till.local()).has('u1')).toBe(false);
  });

  it('5. a trashed product (backlog 51) is proven gone by confirmGone and removed', async () => {
    const store = createFakeStore(10);
    const till = await tillOf(store);
    store.edit(7, { status: 'trash' }, stamp(30));
    await till.poll();
    expect((await till.local()).has('u7')).toBe(true);

    const events = await reconcile(till);
    expect(keysOf(events, 'tombstoned')).toEqual(['u7']);
    expect(store.requests.some((url) => url.searchParams.get('include') === '7' && url.searchParams.get('status') === 'any')).toBe(true);
    await till.poll();
    expect((await till.local()).has('u7')).toBe(false);
  });

  it('6. a missed publish -> draft change is proven gone (not publish) and removed', async () => {
    const store = createFakeStore(10);
    const till = await tillOf(store);
    store.edit(6, { status: 'draft' }, stamp(10)); // missed: the mark's own second
    await till.poll();
    expect((await till.local()).has('u6')).toBe(true);

    const events = await reconcile(till);
    expect([keysOf(events, 'refetched'), keysOf(events, 'tombstoned')]).toEqual([[], ['u6']]);
    await till.poll();
    expect((await till.local()).has('u6')).toBe(false);
  });

  it('7. a stock change written without a modified-time bump (A1) is caught by the stock tuple and refetched', async () => {
    const store = createFakeStore(10);
    const till = await tillOf(store);
    store.writeStock(8, 0, 'outofstock');
    await till.poll();
    expect((await till.local()).get('u8')).toMatchObject({ stock_quantity: 10, stock_status: 'instock' });

    expect(keysOf(await reconcile(till), 'refetched')).toEqual(['u8']);
    await till.poll();
    expect((await till.local()).get('u8')).toMatchObject({ stock_quantity: 0, stock_status: 'outofstock' });
  });

  it('8. a product hidden from the POS after sync (online only, POS-only products on) is proven gone and removed', async () => {
    const store = createFakeStore(10);
    store.posOnlyProducts = true;
    const till = await tillOf(store);
    store.onlineOnly.add(7);
    store.edit(7, { name: 'Hidden' }, stamp(30)); // the save moves the modified time, yet the pull never returns it
    await till.poll();
    expect(await nameOf(till, 'u7')).toBe('Product 7');

    const events = await reconcile(till);
    expect([keysOf(events, 'refetched'), keysOf(events, 'tombstoned')]).toEqual([[], ['u7']]);
    expect(store.requests.some((url) => url.searchParams.get('include') === '7')).toBe(true);
    await till.poll();
    expect((await till.local()).has('u7')).toBe(false);
  });

  it('8b. hiding many at once is held by the brake, with a message for the store owner', async () => {
    const store = createFakeStore(50);
    store.posOnlyProducts = true;
    const till = await tillOf(store);
    for (let id = 1; id <= 12; id++) store.onlineOnly.add(id);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const events = await reconcile(till);
    const message = '12 products the online store no longer lists were kept on this till: removing that many at once needs a check. '
      + 'If they were hidden or removed on purpose, the person who manages this till can allow the removal.';
    const hidden = Array.from({ length: 12 }, (_, i) => `u${i + 1}`).sort(); // the keys come in primary-key order
    expect(events).toContainEqual({ type: 'kept', count: 12, keys: hidden, reason: 'brake', message });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(message));
    expect(store.requests.some((url) => url.searchParams.has('include'))).toBe(false);
    await till.poll();
    expect((await till.local()).size).toBe(50);
  });

  it('8c. with POS-only products off, an online-only product is still listed and nothing is removed', async () => {
    const store = createFakeStore(10);
    const till = await tillOf(store);
    store.onlineOnly.add(7);
    store.edit(7, { name: 'Online only' }, stamp(30));
    await till.poll();
    expect(await nameOf(till, 'u7')).toBe('Online only');

    const events = await reconcile(till);
    expect([keysOf(events, 'tombstoned'), events.filter((e) => e.type === 'kept')]).toEqual([[], []]);
    await till.poll();
    expect(await nameOf(till, 'u7')).toBe('Online only');
  });

  it('9. a product whose uuid changed in the store is replaced: delivered under its new uuid, the old copy removed by the feed, nothing tombstoned by the runner (#331)', async () => {
    const store = createFakeStore(20);
    const till = await tillOf(store);
    store.edit(12, { uuid: 'u12-new' }, stamp(12));
    store.writeStock(12, 0, 'outofstock');
    const events = await reconcile(till);
    await till.poll();
    const local = await till.local();
    expect(local.get('u12-new')).toMatchObject({ id: 12, stock_quantity: 0, stock_status: 'outofstock' });
    expect(local.has('u12')).toBe(false);
    expect(keysOf(events, 'tombstoned')).toEqual([]);
  });
});

describe('WooCommerce catalogue reconcile: guards', () => {
  it('a product present remotely but missing locally is refetched by its remote id', async () => {
    const store = createFakeStore(10);
    const till = await tillOf(store);
    // An import with a back-dated modified time, below the mark: the pull never returns it.
    store.rows.push({ ...store.row(1), id: 11, uuid: 'u11', name: 'Imported', date_modified_gmt: stamp(0), date_modified: stamp(0) } satisfies FakeRow);
    await till.poll();
    expect((await till.local()).has('u11')).toBe(false);

    expect(keysOf(await reconcile(till), 'refetched')).toEqual(['11']); // no local copy: the listing's key
    expect(store.requests.some((url) => url.searchParams.get('include') === '11' && !url.searchParams.has('_fields'))).toBe(true);
    await till.poll();
    expect(await nameOf(till, 'u11')).toBe('Imported');
  });

  it('the refetches share the request budget: with every page differing, no 60 s window holds more than requestsPerMinute', async () => {
    const store = createFakeStore(300);
    const till = await tillOf(store, { batchSize: 100 });
    for (const row of store.rows) row.stock_quantity = 0; // every page differs; the pull sees none of it
    // Virtual time: a budget wait (at most 60 s) moves the clock only once the till is in sync, so each refetch is
    // stamped at the time it was really sent. Longer timers (the gate checks) never fire.
    let t = Date.UTC(2026, 8, 30);
    const setTimer = (fn: () => void, ms: number) => {
      let live = ms <= 60_000;
      void (async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        await till.state.awaitInSync();
        if (live) { t += ms; fn(); }
      })();
      return () => { live = false; };
    };
    // The pass's own requests: the status read, the listing pages and the include= refetches (not the pull's mark).
    const sent: number[] = [];
    store.respond = (url) => {
      if (url.pathname.endsWith('/status') || url.searchParams.has('_fields') || url.searchParams.has('include')) sent.push(t);
      return undefined;
    };
    const events: CatalogueReconcileEvent[] = [];
    const runner = startCatalogueReconcile({
      collection: till.collection, adapter: till.connector.reconcile!.catalogue!, context, reSync: () => till.state.reSync(),
      requestsPerMinute: 4, now: () => t, setTimer, log: (event) => events.push(event),
    });
    runner.reconcile();
    await vi.waitFor(() => expect(events.some((e) => e.type === 'pass-completed')).toBe(true), { timeout: 10_000, interval: 10 });
    runner.stop();
    await till.poll();

    expect(events.reduce((n, e) => n + (e.type === 'refetched' ? e.count : 0), 0)).toBe(300);
    expect(sent).toHaveLength(8); // the status read, 4 pages (the last one empty) and 3 refetches
    for (const at of sent) expect(sent.filter((s) => s >= at && s < at + 60_000).length).toBeLessThanOrEqual(4);
    expect([...(await till.local()).values()].every((p) => p.stock_quantity === 0)).toBe(true);
  }, 20_000);

  it('never tombstones a product the store cannot be asked about: no numeric id locally or in the listing', async () => {
    const store = createFakeStore(10);
    const row = store.row(5);
    delete (row as Partial<FakeRow>).id; // the schema requires only uuid
    const till = await tillOf(store);
    expect((await till.local()).get('u5')?.id).toBeUndefined();
    row.stock_quantity = 0; // the fingerprint now differs

    await reconcile(till);
    await till.poll();
    expect((await till.local()).has('u5')).toBe(true);
  });

  it('keeps a candidate confirmGone does not confirm: still published, just missing from a truncated listing', async () => {
    const store = createFakeStore(10);
    const till = await tillOf(store);
    store.listingDrops = (r) => r.id === 9;

    const events = await reconcile(till);
    expect(events).toContainEqual({ type: 'kept', count: 1, keys: ['u9'], reason: 'unconfirmed' });
    expect(keysOf(events, 'tombstoned')).toEqual([]);
    await till.poll();
    expect((await till.local()).has('u9')).toBe(true);
  });

  it('the brake holds over 20%: 12 of 50 trashed are kept, and confirmGone is never asked', async () => {
    const store = createFakeStore(50);
    const till = await tillOf(store);
    for (let id = 1; id <= 12; id++) store.row(id).status = 'trash';
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const events = await reconcile(till);
    expect(events).toContainEqual(expect.objectContaining({ type: 'kept', count: 12, reason: 'brake' }));
    expect(store.requests.some((url) => url.searchParams.has('include'))).toBe(false);
    await till.poll();
    expect((await till.local()).size).toBe(50);
  });

  it('an existing install keeps its checkpoint: the plain pull checkpoint is read under legacyKey, no full resync', async () => {
    const store = createFakeStore(6);
    const plain = await tillOf(store, { batchSize: 2, adapter: wooProductReplication });
    await plain.state.cancel();
    const before = store.requests.length;
    const till = await startTill(store, { batchSize: 2, db: plain.db });
    await till.sync();
    // One mark request finds nothing newer; a full resync would page all six products again.
    expect(store.requests.length - before).toBe(1);
  });

  it('every request carries context.headers and Content-Type: the pull, the status read, the listing, confirmGone and fetchByIds', async () => {
    const sentinel = { ...context, headers: { ...createWooCommerceConnector().auth.getHeaders({ token: 't' }), 'X-Test-Sentinel': '1' } };
    const store = createFakeStore(10);
    const till = await tillOf(store, { batchSize: 100, syncContext: sentinel });
    store.writeStock(2, 0, 'outofstock'); // refetched by fetchByIds
    store.row(3).status = 'trash'; // re-read by confirmGone

    const events = await reconcile(till, sentinel);
    await till.poll();
    expect([keysOf(events, 'refetched'), keysOf(events, 'tombstoned')]).toEqual([['u2'], ['u3']]);
    const kinds = store.requests.map((url) => `${url.pathname.split('/').pop()} ${url.searchParams.get('_fields') ?? (url.searchParams.has('include') ? 'include' : '')}`);
    expect(new Set(kinds)).toEqual(new Set(['products ', 'status ', 'products id,date_modified_gmt,stock_quantity,stock_status', 'products id,uuid,status', 'products include']));
    const missing = store.headers.flatMap((headers, i) =>
      (headers['X-Test-Sentinel'] === '1' && headers['X-WCPOS-Protocol'] === '2' && headers['Content-Type'] === 'application/json' ? [] : [kinds[i]]));
    expect(missing).toEqual([]);
  });

  it('a /status answering 500 is "no capability known": the pass lists page by page and corrects the till', async () => {
    const store = createFakeStore(10);
    const till = await tillOf(store);
    store.respond = (url) => (url.pathname.endsWith('/status') ? new Response('boom', { status: 500 }) : undefined);
    store.writeStock(4, 0, 'outofstock');

    const events = await reconcile(till);
    expect(events.some((e) => e.type === 'pass-completed')).toBe(true);
    expect(keysOf(events, 'refetched')).toEqual(['u4']);
    await till.poll();
    expect((await till.local()).get('u4')).toMatchObject({ stock_quantity: 0 });
  });

  it('a 401 on the listing stops the pass (errorKind till) and changes nothing', async () => {
    const store = createFakeStore(3);
    const till = await tillOf(store);
    store.respond = (url) => (url.searchParams.has('_fields') ? new Response('Unauthorized', { status: 401 }) : undefined);

    const events = await reconcile(till);
    expect(events).toContainEqual({ type: 'stopped', reason: 'till', code: 'unauthorized' });
    expect((await till.local()).size).toBe(3);
  });
});

describe('WooCommerce catalogue reconcile: fast path (#313)', () => {
  const fastStore = (size: number) => {
    const store = createFakeStore(size);
    store.capabilities = ['products_id_fast_path'];
    return store;
  };
  const isFastPath = (url: URL) => url.searchParams.get('per_page') === '-1';
  const summaryOf = (events: CatalogueReconcileEvent[]) => {
    const { type: _, durationMs: __, ...summary } = events.find((e) => e.type === 'pass-completed') as Extract<CatalogueReconcileEvent, { type: 'pass-completed' }>;
    return summary;
  };
  const UNCHANGED = { pages: 2, compared: 10, refetched: 0, tombstoned: 0, kept: 0, unlisted: 0 };
  /** One pass that went through the fast path. */
  const fastPass = async (till: Till, store: FakeStore) => {
    const events = await reconcile(till);
    expect(store.requests.some(isFastPath)).toBe(true);
    return events;
  };

  it('F1. an unchanged catalogue: one status request, one fast-path request, nothing refetched, unlisted or tombstoned', async () => {
    const store = fastStore(10);
    const till = await tillOf(store);
    const before = store.requests.length;

    const events = await reconcile(till);
    expect(store.requests.slice(before).map((url) => `${url.pathname.split('/').pop()} ${isFastPath(url)}`)).toEqual(['status false', 'products true']);
    expect(summaryOf(events)).toEqual(UNCHANGED);
  });

  it('F2. a stamp-only edit and a stock-only direct write are each refetched', async () => {
    const store = fastStore(10);
    const till = await tillOf(store);
    store.edit(3, {}, stamp(30));
    store.writeStock(5, 0, 'outofstock');

    expect(keysOf(await fastPass(till, store), 'refetched').sort()).toEqual(['u3', 'u5']);
    await till.poll();
    expect((await till.local()).get('u5')).toMatchObject({ stock_quantity: 0, stock_status: 'outofstock' });
  });

  it('F3. a product new to the store and missed by the pull is delivered with its uuid', async () => {
    const store = fastStore(10);
    const till = await tillOf(store);
    store.rows.push({ ...store.row(1), id: 11, uuid: 'u11', name: 'Imported', date_modified_gmt: stamp(0), date_modified: stamp(0) } satisfies FakeRow);
    await till.poll();
    expect((await till.local()).has('u11')).toBe(false);

    expect(keysOf(await fastPass(till, store), 'refetched')).toEqual(['11']);
    await till.poll();
    expect(await nameOf(till, 'u11')).toBe('Imported');
  });

  it('F4. a held product that is deleted, set to draft or POS-hidden is confirmed gone by include= and tombstoned', async () => {
    const store = fastStore(10);
    store.posOnlyProducts = true;
    const till = await tillOf(store);
    store.rows.splice(store.rows.findIndex((r) => r.id === 2), 1);
    store.row(4).status = 'draft';
    store.onlineOnly.add(6);

    const events = await fastPass(till, store);
    expect([keysOf(events, 'refetched'), keysOf(events, 'tombstoned')]).toEqual([[], ['u2', 'u4', 'u6']]);
    expect(store.requests.some((url) => url.searchParams.get('include') === '2,4,6')).toBe(true);
    await till.poll();
    expect([...(await till.local()).keys()].sort()).toEqual(['u1', 'u10', 'u3', 'u5', 'u7', 'u8', 'u9']);
  });

  it('F5. a draft the till never held is ignored: no refetch, and no request names it', async () => {
    const store = fastStore(10);
    const till = await tillOf(store);
    store.rows.push({ ...store.row(1), id: 11, uuid: 'u11', name: 'Draft', status: 'draft', ...at(stamp(40)) } satisfies FakeRow);
    const before = store.requests.length;

    const events = await fastPass(till, store);
    expect(summaryOf(events)).toEqual(UNCHANGED);
    expect(store.requests.slice(before).some((url) => url.searchParams.get('include')?.split(',').includes('11'))).toBe(false);
  });

  it('F6. hiding more than 20% at once is held by the brake', async () => {
    const store = fastStore(50);
    store.posOnlyProducts = true;
    const till = await tillOf(store);
    for (let id = 1; id <= 12; id++) store.onlineOnly.add(id);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const events = await fastPass(till, store);
    expect(events).toContainEqual(expect.objectContaining({ type: 'kept', count: 12, reason: 'brake' }));
    expect(store.requests.some((url) => url.searchParams.has('include'))).toBe(false);
    await till.poll();
    expect((await till.local()).size).toBe(50);
  });

  it('F7. a fast path answering 400 falls through to the paged listing in the same pass, with one warning', async () => {
    const store = fastStore(10);
    const till = await tillOf(store);
    store.respond = (url) => (isFastPath(url) ? new Response('{"code":"rest_invalid_param"}', { status: 400 }) : undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = store.requests.length;

    const events = await reconcile(till);
    expect(summaryOf(events)).toEqual(UNCHANGED); // F1's outcome: the status page and one listing page
    expect(store.requests.slice(before).map((url) => url.searchParams.get('page'))).toEqual([null, null, '1']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('400'));
  });

  it('F7b. a fast path answering 200 with a non-list falls through to the paged listing, with one warning', async () => {
    const store = fastStore(10);
    const till = await tillOf(store);
    store.respond = (url) => (isFastPath(url) ? new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }) : undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = store.requests.length;

    const events = await reconcile(till);
    expect(summaryOf(events)).toEqual(UNCHANGED);
    expect(store.requests.slice(before).map((url) => url.searchParams.get('page'))).toEqual([null, null, '1']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not a list'));
  });

  it('F8. a product whose uuid moved is delivered with its new stock and its old copy removed by the feed (#331)', async () => {
    const store = fastStore(20);
    const till = await tillOf(store);
    expect((await till.local()).has('u12')).toBe(true);
    store.edit(12, { uuid: 'u12-new' }, stamp(12));
    store.writeStock(12, 0, 'outofstock');

    const events = await fastPass(till, store);
    await till.poll();
    const local = await till.local();
    expect(local.get('u12-new')).toMatchObject({ id: 12, stock_quantity: 0, stock_status: 'outofstock' });
    expect(local.has('u12')).toBe(false);
    expect(keysOf(events, 'tombstoned')).toEqual([]);
  });
});
