// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import type { TallyConnector } from '@tallyui/core';

import { createTallyDatabase } from './create-db';
import { WEB_STORAGE_ENGINE, REQUIRED_MULTI_INSTANCE_BY_ENGINE } from './engine';

// ADR-061's multi-instance ruling test (in the shape of WCPOS's
// multi-instance-ruling.test.ts): the engine and multiInstance are pinned
// together, and multiInstance: true is unsupported everywhere.

const schema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: { id: { type: 'string', maxLength: 100 } },
  required: ['id'],
};
const connector = { id: 'test', schemas: { products: schema } } as unknown as TallyConnector;

// A fake storage bearing job 2a's marker, without depending on
// @tallyui/storage-sqlite (job 2b must not import job 2a's package).
function sqliteSahpoolStorage() {
  return Object.assign(getRxStorageMemory(), { tallyEngine: WEB_STORAGE_ENGINE });
}

describe('the engine pin (ADR-061)', () => {
  it('defaults multiInstance to REQUIRED_MULTI_INSTANCE_BY_ENGINE[WEB_STORAGE_ENGINE]', async () => {
    expect(REQUIRED_MULTI_INSTANCE_BY_ENGINE[WEB_STORAGE_ENGINE]).toBe(false);
    const db = await createTallyDatabase({
      connector,
      storage: getRxStorageMemory(),
      name: `engine_default_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    });
    try {
      expect(db.multiInstance).toBe(REQUIRED_MULTI_INSTANCE_BY_ENGINE[WEB_STORAGE_ENGINE]);
    } finally {
      await db.close();
    }
  });

  it.each([
    ['a storage marked tallyEngine: sqlite-sahpool', sqliteSahpoolStorage],
    ['memory storage', getRxStorageMemory],
  ])('throws the ADR-061 error when multiInstance: true is passed with %s', async (_label, makeStorage) => {
    await expect(createTallyDatabase({
      connector,
      storage: makeStorage(),
      multiInstance: true,
      name: `engine_throw_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    })).rejects.toThrow(/ADR-061/);
  });
});
