import { expect, it, vi } from 'vitest';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import type { TallyConnector } from '@tallyui/core';

// Dev mode's init reads RxDB's premium flag in a browser (jsdom here), and RxDB caches the answer,
// so importing this package must not add it: it would cache false before the app's storage sets
// the flag. A direct `hasPremiumFlag()` check can't show that in this suite, where the setup file
// sets the flag before any test file loads; so this spies on `addRxPlugin` instead.
const addRxPlugin = vi.hoisted(() => vi.fn());
vi.mock('rxdb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('rxdb')>();
  addRxPlugin.mockImplementation(actual.addRxPlugin);
  return { ...actual, addRxPlugin };
});

it('adds the dev-mode plugin when a database is created, not when the module is imported', async () => {
  const { createTallyDatabase } = await import('./create-db');
  expect(addRxPlugin).not.toHaveBeenCalledWith(RxDBDevModePlugin);

  const schema = { version: 0, primaryKey: 'id', type: 'object', properties: { id: { type: 'string', maxLength: 100 } }, required: ['id'] };
  const db = await createTallyDatabase({
    connector: { id: 'test', schemas: { products: schema } } as unknown as TallyConnector,
    name: `devmode_${Date.now()}`,
    storage: getRxStorageMemory(),
  });
  await db.close();
  expect(addRxPlugin).toHaveBeenCalledWith(RxDBDevModePlugin);
});
