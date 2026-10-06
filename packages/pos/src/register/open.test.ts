// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { addRegisterSessionCollection } from './open';
import { addRegisterSessionCollectionTests } from './open.test-helper';
import { mintUuid } from './register-document';

describe('addRegisterSessionCollection on memory storage', () => addRegisterSessionCollectionTests(() => getRxStorageMemory()));

it('refuses a multiInstance database', async () => {
  const db = await createRxDatabase({ name: `registermulti${mintUuid().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: true });
  try {
    await expect(addRegisterSessionCollection(db)).rejects.toThrow('addRegisterSessionCollection: multiInstance databases are not supported (ADR-061)');
  } finally { await db.close(); }
});
