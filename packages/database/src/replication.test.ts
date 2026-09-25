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
