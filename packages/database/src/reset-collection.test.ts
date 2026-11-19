import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRxDatabase, addRxPlugin, type RxCollection, type RxDatabase, type RxJsonSchema } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { ReplicationAdapter, SyncContext } from '@tallyui/core';

import { connectorCollection } from './connector-collection';
import { startReplication, type TallyReplicationState } from './replication';
import { REPLICATION_GENERATION_DOC, replicationGeneration, resetCollection } from './reset-collection';

// The database, schema, storage and context are copied from replication.test.ts.
addRxPlugin(RxDBDevModePlugin);

const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });

type Doc = { id: string; name: string };
type Collections = { products: RxCollection<Doc>; plain: RxCollection<Doc> };

const testSchema: RxJsonSchema<Doc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    name: { type: 'string' },
  },
  required: ['id', 'name'],
};

const context: SyncContext = {
  connectorId: 'test',
  baseUrl: 'https://example.com',
  headers: {},
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean, ms = 2000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out waiting');
    await sleep(5);
  }
}

const DOCS = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];

/** Records every checkpoint; `undefined` returns a, b, c at `{ n: 3 }`, any other an empty page. */
function fakeAdapter(push = false) {
  const calls: unknown[] = [];
  const control = { failNext: false };
  const adapter: ReplicationAdapter<Doc, unknown> = {
    pull: {
      handler: async (checkpoint: unknown) => {
        calls.push(checkpoint);
        if (control.failNext) {
          control.failNext = false;
          // A transient error, as in replication.errors.test.ts.
          throw new Error('WooCommerce API error: 503');
        }
        if (checkpoint === undefined) return { documents: DOCS.map(doc => ({ ...doc, _deleted: false })), checkpoint: { n: 3 } };
        return { documents: [], checkpoint };
      },
    },
    ...(push ? { push: { handler: async () => [] } } : {}),
  };
  return { adapter, calls, control };
}

describe('resetCollection', () => {
  let db: RxDatabase<Collections>;
  const states: TallyReplicationState<Doc, unknown>[] = [];
  const track = (state: TallyReplicationState<Doc, unknown>) => {
    states.push(state);
    return state;
  };
  const contents = async (collection: RxCollection<Doc>) =>
    (await collection.find().exec()).map(doc => doc.toJSON()).sort((x, y) => x.id.localeCompare(y.id));

  beforeEach(async () => {
    db = await createRxDatabase<Collections>({ name: `reset_${Date.now()}_${Math.random().toString(36).slice(2)}`, storage, multiInstance: false });
    await db.addCollections({ products: connectorCollection(testSchema) });
  });

  afterEach(async () => {
    for (const state of states.splice(0)) await state.cancel();
    await db?.close();
  });

  /** Starts the collection, awaits its initial pull of a, b, c, and resets it. */
  async function startAndReset(options: { retryTime?: number } = {}) {
    const fake = fakeAdapter();
    const base = { collection: db.products, adapter: fake.adapter, context, ...options };
    const state = track(startReplication(base));
    await state.awaitInitialReplication();
    const before = await contents(db.products);
    const callsBefore = fake.calls.length;
    const next = track(await resetCollection({ ...base, state }));
    return { ...fake, base, state, next, before, callsBefore };
  }

  it('R1: pulls from no checkpoint after the reset and writes back the identical documents', async () => {
    const { calls, next, before, callsBefore } = await startAndReset();
    await next.awaitInitialReplication();
    expect(calls.length).toBeGreaterThan(callsBefore);
    expect(calls[callsBefore]).toBeUndefined();
    expect(before.map(doc => doc.id)).toEqual(['a', 'b', 'c']);
    expect(await contents(db.products)).toEqual(before);
  });

  it('R2: the generation is 1 after one reset', async () => {
    const { next } = await startAndReset();
    await next.awaitInitialReplication();
    expect(await replicationGeneration(db.products)).toBe(1);
  });

  it('R3: a later start at the stored generation pulls from the stored checkpoint and changes nothing', async () => {
    const { calls, base, next } = await startAndReset();
    await next.awaitInitialReplication();
    const docsBefore = (await db.products.find().exec()).map(doc => [doc.id, doc.revision]);
    await next.cancel();
    const callsBefore = calls.length;
    const later = track(startReplication({ ...base, generation: await replicationGeneration(db.products) }));
    await later.awaitInitialReplication();
    expect(calls[callsBefore]).toEqual({ n: 3 });
    expect((await db.products.find().exec()).map(doc => [doc.id, doc.revision])).toEqual(docsBefore);
  });

  it('R4: a second reset moves to generation 2 and pulls from no checkpoint again', async () => {
    const { calls, base, next } = await startAndReset();
    await next.awaitInitialReplication();
    const callsBefore = calls.length;
    const third = track(await resetCollection({ ...base, state: next }));
    await third.awaitInitialReplication();
    expect(await replicationGeneration(db.products)).toBe(2);
    expect(calls[callsBefore]).toBeUndefined();
    expect((await contents(db.products)).map(doc => doc.id)).toEqual(['a', 'b', 'c']);
  });

  it('R5: a collection never reset keeps its identifier at generation 0', async () => {
    const { adapter, calls } = fakeAdapter();
    const first = track(startReplication({ collection: db.products, adapter, context }));
    await first.awaitInitialReplication();
    await first.cancel();
    const callsBefore = calls.length;
    const second = track(startReplication({ collection: db.products, adapter, context, generation: 0 }));
    await second.awaitInitialReplication();
    expect(second.replicationIdentifier).toBe('test-products');
    expect(second.replicationIdentifier).toBe(first.replicationIdentifier);
    expect(calls[callsBefore]).toEqual({ n: 3 });
  });

  it('R6: refuses a collection that pushes, with nothing changed', async () => {
    const { adapter } = fakeAdapter(true);
    const base = { collection: db.products, adapter, context };
    const state = track(startReplication(base));
    await state.awaitInitialReplication();
    await expect(resetCollection({ ...base, state })).rejects.toThrow(/products/);
    expect(state.isStopped()).toBe(false);
    expect((await contents(db.products)).map(doc => doc.id)).toEqual(['a', 'b', 'c']);
    expect(await replicationGeneration(db.products)).toBe(0);
  });

  it('R7: removes the catalogue reconcile state and keeps other local documents', async () => {
    const fake = fakeAdapter();
    const base = { collection: db.products, adapter: fake.adapter, context };
    const state = track(startReplication(base));
    await state.awaitInitialReplication();
    await db.products.upsertLocal('catalogue-reconcile', { lastCompleteAt: 1 });
    await db.products.upsertLocal('other', { x: 1 });
    const next = track(await resetCollection({ ...base, state }));
    await next.awaitInitialReplication();
    expect(await db.products.getLocal('catalogue-reconcile')).toBeNull();
    expect((await db.products.getLocal('other'))?.get('x')).toBe(1);
    expect((await db.products.getLocal(REPLICATION_GENERATION_DOC))?.get('generation')).toBe(1);
  });

  it('R8: a transient error after the reset leaves the collection empty and retries', async () => {
    const fake = fakeAdapter();
    const base = { collection: db.products, adapter: fake.adapter, context, retryTime: 100 };
    const state = track(startReplication(base));
    await state.awaitInitialReplication();
    const callsBefore = fake.calls.length;
    fake.control.failNext = true;
    const next = track(await resetCollection({ ...base, state }));
    expect(await db.products.count().exec()).toBe(0);
    await until(() => fake.calls.length > callsBefore);
    expect(next.isStopped()).toBe(false);
    await until(() => fake.calls.length > callsBefore + 1);
    expect(fake.calls[callsBefore + 1]).toBeUndefined();
  });

  it('R9: a collection without local documents is refused, with nothing changed', async () => {
    await db.addCollections({ plain: { schema: testSchema } });
    const { adapter } = fakeAdapter();
    const base = { collection: db.plain, adapter, context };
    const state = track(startReplication(base));
    await state.awaitInitialReplication();
    await expect(replicationGeneration(db.plain)).rejects.toThrow(/connectorCollection/);
    await expect(resetCollection({ ...base, state })).rejects.toThrow(/connectorCollection/);
    expect(state.isStopped()).toBe(false);
    expect((await contents(db.plain)).map(doc => doc.id)).toEqual(['a', 'b', 'c']);
  });
});
