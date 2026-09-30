import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRxDatabase, addRxPlugin } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';

import { connectorCollection } from './connector-collection';
import { startReplication } from './replication';
import type { ReplicationAdapter, SyncContext } from '@tallyui/core';

addRxPlugin(RxDBDevModePlugin);

const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });

const testSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object' as const,
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

describe('startReplication', () => {
  let db: any;

  beforeEach(async () => {
    db = await createRxDatabase({
      name: `test_${Date.now()}`,
      storage,
      multiInstance: false,
      ignoreDuplicate: true,
    });
    await db.addCollections({ products: { schema: testSchema } });
  });

  afterEach(async () => {
    await db?.close();
  });

  it('starts replication and pulls documents', async () => {
    const adapter: ReplicationAdapter<any, any> = {
      pull: {
        handler: vi.fn().mockResolvedValueOnce({
          documents: [
            { id: '1', name: 'Widget', _deleted: false },
          ],
          checkpoint: { id: '1' },
        }).mockResolvedValue({
          documents: [],
          checkpoint: { id: '1' },
        }),
      },
    };

    const state = startReplication({
      collection: db.products,
      adapter,
      context,
    });

    await state.awaitInSync();

    const docs = await db.products.find().exec();
    expect(docs).toHaveLength(1);
    expect(docs[0].name).toBe('Widget');

    await state.cancel();
  });

  it('passes adapter.pull.batchSize to RxDB as the pull page size', async () => {
    const handler = vi.fn().mockResolvedValue({ documents: [], checkpoint: {} });
    const adapter = { pull: { batchSize: 7, handler } };
    const state = startReplication({ collection: db.products, adapter, context });
    await state.awaitInSync();
    expect(handler.mock.calls[0][1]).toBe(7);
    await state.cancel();
  });

  it("uses RxDB's default of 100 when the adapter sets none", async () => {
    const handler = vi.fn().mockResolvedValue({ documents: [], checkpoint: {} });
    const adapter = { pull: { handler } };
    const state = startReplication({ collection: db.products, adapter, context });
    await state.awaitInSync();
    expect(handler.mock.calls[0][1]).toBe(100);
    await state.cancel();
  });

  // Above version 0 a new identifier resets the checkpoint after a drop-and-resync bump (backlog 44).
  it.each([[0, 'test-products'], [2, 'test-products-v2']])('at schema version %i the replication identifier is %s', async (version, identifier) => {
    if (version > 0) {
      await db.close();
      db = await createRxDatabase({ name: `test_v${version}_${Date.now()}`, storage, multiInstance: false, ignoreDuplicate: true });
      await db.addCollections({ products: connectorCollection({ ...testSchema, version } as any) });
    }
    const adapter: ReplicationAdapter<any, any> = {
      pull: { handler: vi.fn().mockResolvedValue({ documents: [], checkpoint: {} }) },
    };
    const state = startReplication({ collection: db.products, adapter, context });
    expect(state.replicationIdentifier).toBe(identifier);
    await state.cancel();
  });

  it('returns RxReplicationState with observables', async () => {
    const adapter: ReplicationAdapter<any, any> = {
      pull: {
        handler: vi.fn().mockResolvedValue({ documents: [], checkpoint: {} }),
      },
    };

    const state = startReplication({
      collection: db.products,
      adapter,
      context,
    });

    expect(state.error$).toBeDefined();
    expect(state.active$).toBeDefined();
    expect(state.received$).toBeDefined();

    await state.cancel();
  });
});

describe('startReplication: one adapter object replicating into two databases (#307)', () => {
  const databases: any[] = [];
  // A fresh module per test: the guard's warn-once state is module-level, and one test must not hide another's warning.
  let start: typeof startReplication;
  beforeEach(async () => {
    vi.resetModules();
    ({ startReplication: start } = await import('./replication'));
  });
  afterEach(async () => {
    for (const database of databases.splice(0)) await database.close();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  const newCollection = async () => {
    const database = await createRxDatabase({ name: `guard_${Math.random().toString(36).slice(2)}`, storage, multiInstance: false });
    databases.push(database);
    await database.addCollections({ products: { schema: testSchema } });
    return database.products;
  };
  // A new object each call: a connector instance's combined pull adapter.
  const newAdapter = (): ReplicationAdapter<any, any> => ({ pull: { handler: async () => ({ documents: [], checkpoint: {} }) } });
  const warnings = () => vi.spyOn(console, 'warn').mockImplementation(() => {});

  it('warns exactly once when the same adapter object starts on another collection while the first is live', async () => {
    const warn = warnings();
    const shared = newAdapter();
    const collections = [await newCollection(), await newCollection(), await newCollection()];
    const states = collections.map((collection) => start({ collection, adapter: shared, context }));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('one connector instance is replicating into two databases');
    for (const state of states) await state.cancel();
  });

  it('does not warn for two different adapter objects, nor for a restart on the same collection', async () => {
    const warn = warnings();
    const [one, two] = [await newCollection(), await newCollection()];
    const shared = newAdapter();
    const states = [
      start({ collection: one, adapter: shared, context }),
      start({ collection: one, adapter: shared, context }),
      start({ collection: two, adapter: newAdapter(), context }),
    ];
    expect(warn).not.toHaveBeenCalled();
    for (const state of states) await state.cancel();
  });

  it('does not warn for a start after the first replication was cancelled, or after a one-shot replication completed', async () => {
    const warn = warnings();
    const shared = newAdapter();
    const first = start({ collection: await newCollection(), adapter: shared, context });
    await first.cancel();
    const oneShot = start({ collection: await newCollection(), adapter: shared, context, live: false });
    await vi.waitFor(() => expect(oneShot.isStopped()).toBe(true), { timeout: 5_000, interval: 10 });
    const third = start({ collection: await newCollection(), adapter: shared, context });
    expect(warn).not.toHaveBeenCalled();
    await third.cancel();
  });

  it('never warns in a production build', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warn = warnings();
    const shared = newAdapter();
    const states = [start({ collection: await newCollection(), adapter: shared, context }),
      start({ collection: await newCollection(), adapter: shared, context })];
    expect(warn).not.toHaveBeenCalled();
    for (const state of states) await state.cancel();
  });
});
