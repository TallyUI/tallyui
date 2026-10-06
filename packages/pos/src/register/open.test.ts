// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { registerSessionCollection } from '..';
import { addRegisterSessionCollection } from './open';
import { addRegisterSessionCollectionTests } from './open.test-helper';
import { mintUuid } from './register-document';

describe('addRegisterSessionCollection on memory storage', () => addRegisterSessionCollectionTests(() => getRxStorageMemory()));

it('the old registerSessionCollection() route fails at start, naming addRegisterSessionCollection', async () => {
  const db = await createRxDatabase({ name: `registeroldroute${mintUuid().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  try {
    expect(() => db.addCollections({ register_sessions: registerSessionCollection() })).toThrow(/addRegisterSessionCollection/);
    expect(db.collections.register_sessions).toBeUndefined();
  } finally { await db.close(); }
});

it('refuses a multiInstance database', async () => {
  const db = await createRxDatabase({ name: `registermulti${mintUuid().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: true });
  try {
    await expect(addRegisterSessionCollection(db)).rejects.toThrow('addRegisterSessionCollection: multiInstance databases are not supported (ADR-061)');
  } finally { await db.close(); }
});
