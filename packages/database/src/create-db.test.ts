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
      if (multiInstance) {
        await db.upsertLocal('outbox-test', { authRequired: true });
        expect((await db.getLocal('outbox-test'))?.get('authRequired')).toBe(true);
      } else {
        await expect(db.getLocal('outbox-test')).rejects.toThrow();
      }
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

  const stockConnector = (schemas: Record<string, unknown>, stock: boolean) => ({
    id: 'test', schemas, reconcile: stock ? { stock: { fetchPages: async function* () {}, overlay: () => undefined } } : undefined,
  }) as unknown as TallyConnector;
  const productSchema = {
    version: 0, primaryKey: 'id', type: 'object',
    properties: { id: { type: 'string', maxLength: 100 } }, required: ['id'],
  };

  // Dev mode with ajv, so the untyped `value` property is validated too.
  it.each([true, false])('adds stock_levels only when the connector has reconcile.stock (%s)', async (stock) => {
    vi.resetModules();
    const { createTallyDatabase } = await import('./create-db');
    const db = await createTallyDatabase({
      connector: stockConnector({ products: productSchema }, stock),
      name: `stock_test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      storage: getRxStorageMemory(),
    });
    try {
      expect(Object.keys(db.collections).sort()).toEqual(stock ? ['products', 'stock_levels'] : ['products']);
      if (stock) {
        await db.stock_levels.insert({ id: 'v1', value: [{ onHand: 3 }], updatedAt: new Date().toISOString() });
        expect((await db.stock_levels.findOne('v1').exec())?.get('value')).toEqual([{ onHand: 3 }]);
        await db.stock_levels.upsertLocal('last-pass', { completedAt: 'x' });
        expect((await db.stock_levels.getLocal('last-pass'))?.get('completedAt')).toBe('x');
      }
    } finally {
      await db.close();
    }
  });

  it('throws when the connector already defines stock_levels', async () => {
    vi.resetModules();
    const { createTallyDatabase } = await import('./create-db');
    await expect(createTallyDatabase({
      connector: stockConnector({ products: productSchema, stock_levels: productSchema }, true),
      name: `clash_test_${Date.now()}`,
      storage: getRxStorageMemory(),
    })).rejects.toThrow(/"stock_levels" collection; that name is reserved/);
  });
});
