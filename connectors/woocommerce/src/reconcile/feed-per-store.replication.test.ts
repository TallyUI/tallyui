// @vitest-environment node
// #307: one reconcile feed per store session. A store switch, or a second store, in one runtime never carries one
// store's queued refetches or tombstones into another's database. Through the real replicateRxCollection.
import { afterEach, describe, expect, it } from 'vitest';
import type { TallyConnector } from '@tallyui/core';
import { closeTills, context, createFakeStore, startTill, type FakeStore } from '../__tests__/fake-store';
import { createWooCommerceConnector, woocommerceConnector } from '../index';

afterEach(closeTills);

type Till = Awaited<ReturnType<typeof startTill>>;

/** A store at `host` with four products, `<prefix><id>`, ids from `first`, and a till on its own database. */
async function tillAt(host: string, prefix: string, first: number, connector: TallyConnector) {
  const store = createFakeStore(4, { host });
  for (const [i, row] of store.rows.entries()) Object.assign(row, { id: first + i, uuid: `${prefix}${first + i}` });
  const till = await startTill(store, { connector, batchSize: 100, syncContext: { ...context, baseUrl: `https://${host}/wp-json/wcpos/v2` } });
  await till.sync();
  expect((await till.local()).size).toBe(4);
  return { store, till };
}

/** Queues, undrained, a refetch of every product but the last and a tombstone for the last, through the instance's adapter. */
async function queueWork(till: Till) {
  const docs = [...(await till.local()).values()];
  const last = docs[docs.length - 1];
  till.connector.reconcile!.catalogue!.enqueue([
    ...docs.slice(0, -1).map((local) => ({ key: local.uuid, local, remote: local.id })),
    { key: last.uuid, local: last, tombstone: true },
  ]);
  return docs;
}

/** What of `docs` reached `till` and `store`: documents with their keys (tombstones included) and requests for their ids. */
async function leaked(till: Till, store: FakeStore, docs: any[]) {
  const found = await till.collection.storageInstance.findDocumentsById(docs.map((d) => d.uuid), true);
  const ids = new Set(docs.map((d) => String(d.id)));
  const requests = store.requests.filter((url) => (url.searchParams.get('include') ?? '').split(',').some((id) => ids.has(id)));
  return { documents: found.map((d: any) => d.uuid).sort(), requests: requests.length };
}

/** Store A's till queues work and is cancelled; store B's till, on a new database, then syncs. */
async function storeSwitch(connectorFor: () => TallyConnector) {
  const a = await tillAt('a.test', 'a', 1, connectorFor());
  const docs = await queueWork(a.till);
  await a.till.state.cancel();
  const b = await tillAt('b.test', 'b', 101, connectorFor());
  return leaked(b.till, b.store, docs);
}

describe('WooCommerce: one reconcile feed per store session (#307)', () => {
  it('the deprecated static export leaks on a store switch: B gets A\'s tombstones and is asked for A\'s ids', async () => {
    const leak = await storeSwitch(() => woocommerceConnector);
    expect(leak.documents).toEqual(['a1', 'a2', 'a3', 'a4']);
    expect(leak.requests).toBeGreaterThan(0);
  });

  it('a store switch with createWooCommerceConnector(): nothing of A reaches B\'s database or B\'s store', async () => {
    expect(await storeSwitch(createWooCommerceConnector)).toEqual({ documents: [], requests: 0 });
  });

  it('two stores at once, one instance each: each queue reaches only its own store and database', async () => {
    const a = await tillAt('a.test', 'a', 1, createWooCommerceConnector());
    const b = await tillAt('b.test', 'b', 101, createWooCommerceConnector());
    a.store.writeStock(1, 0, 'outofstock');
    b.store.writeStock(101, 0, 'outofstock');
    const docsA = await queueWork(a.till);
    const docsB = await queueWork(b.till);
    await Promise.all([a.till.poll(), b.till.poll()]);

    expect(await leaked(b.till, b.store, docsA)).toEqual({ documents: [], requests: 0 });
    expect(await leaked(a.till, a.store, docsB)).toEqual({ documents: [], requests: 0 });
    // Each queue did its own work: the refetch and the tombstone reached their own database.
    expect((await a.till.local()).get('a1')).toMatchObject({ stock_quantity: 0 });
    expect((await b.till.local()).get('b101')).toMatchObject({ stock_quantity: 0 });
    expect([(await a.till.local()).has('a4'), (await b.till.local()).has('b104')]).toEqual([false, false]);
  });
});
