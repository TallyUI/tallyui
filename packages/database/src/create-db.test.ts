// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import type { TallyConnector } from '@tallyui/core';

describe('createTallyDatabase', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([undefined, true])('sets multiInstance to %s, defaulting to false', async (multiInstance) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const { createTallyDatabase } = await import('./create-db');
    const schema = {
      version: 0,
      primaryKey: 'id',
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 100 },
        name: { type: 'string' },
      },
      required: ['id'],
    };
    const connector = {
      id: 'test',
      schemas: { products: schema },
    } as unknown as TallyConnector;
    const db = await createTallyDatabase({
      connector, multiInstance,
      name: `multi_test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      storage: getRxStorageMemory(),
    });
    try {
      expect(db.multiInstance).toBe(multiInstance ?? false);
    } finally {
      await db.close();
    }
  });

  it('creates a database and round-trips a document when NODE_ENV is production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const { createTallyDatabase } = await import('./create-db');

    const schema = {
      version: 0,
      primaryKey: 'id',
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 100 },
        name: { type: 'string' },
      },
      required: ['id'],
    };
    const connector = {
      id: 'test',
      schemas: { products: schema },
    } as unknown as TallyConnector;
    const db = await createTallyDatabase({
      connector,
      name: `prod_test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      storage: getRxStorageMemory(),
    });

    try {
      await db.products.insert({ id: 'p1', name: 'Mug' });
      const product = await db.products.findOne('p1').exec();
      expect(product?.name).toBe('Mug');
    } finally {
      await db.remove();
    }
  });
});
