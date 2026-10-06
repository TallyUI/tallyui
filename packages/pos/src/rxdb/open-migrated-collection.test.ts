// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxCollectionCreator, type RxJsonSchema } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { createLogger } from '../logging';
import { openMigratedCollection, type MigratedCollectionOpener } from './open-migrated-collection';

addRxPlugin(RxDBMigrationSchemaPlugin);

type Thing = { sku: string; state: string };
const v0: RxJsonSchema<Thing> = {
  version: 0, primaryKey: 'sku', type: 'object',
  properties: { sku: { type: 'string', maxLength: 40 }, state: { type: 'string', maxLength: 20 } },
  required: ['sku', 'state'],
};
const v1: RxJsonSchema<Thing> = {
  ...v0, version: 1,
  properties: { ...v0.properties, state: { type: 'string', enum: ['open', 'sent'], maxLength: 20 } },
};
const creator = (): RxCollectionCreator<Thing> => ({ schema: v1, migrationStrategies: { 1: (doc) => doc } });
const opener: MigratedCollectionOpener<Thing> = {
  name: 'things', creator, label: 'addThings', logger: createLogger('things'),
  closedError: (name) => new Error(`closed ${name}`),
};

describe('openMigratedCollection', () => {
  it('migrates a stale copy by its primary key when that key is not id', async () => {
    const name = `things${Date.now()}${Math.random().toString(36).slice(2)}`;
    const storage = getRxStorageMemory();
    const validating = wrappedValidateAjvStorage({ storage });
    const older = await createRxDatabase({ name, storage, multiInstance: false });
    try {
      const { things } = await older.addCollections({ things: { schema: v0 } });
      await things.bulkInsert([{ sku: 'a', state: 'open' }, { sku: 'b', state: 'bad' }]);
    } finally {
      await older.close();
    }

    const failed = await createRxDatabase({ name, storage: validating, multiInstance: false });
    try {
      await expect(openMigratedCollection(failed, opener, 10_000)).rejects.toMatchObject({ code: 'DM4' });
    } finally {
      await failed.close();
    }

    const rolledBack = await createRxDatabase({ name, storage, multiInstance: false });
    try {
      const { things } = await rolledBack.addCollections({ things: { schema: v0 } });
      await (await things.findOne('a').exec())!.incrementalPatch({ state: 'sent' });
      await (await things.findOne('b').exec())!.incrementalPatch({ state: 'open' });
    } finally {
      await rolledBack.close();
    }

    const reopened = await createRxDatabase({ name, storage: validating, multiInstance: false });
    try {
      const things = await openMigratedCollection(reopened, opener, 10_000);
      expect((await things.find().exec()).map(({ sku, state }) => ({ sku, state })).sort((a, b) => a.sku.localeCompare(b.sku)))
        .toEqual([{ sku: 'a', state: 'sent' }, { sku: 'b', state: 'open' }]);
    } finally {
      await reopened.remove();
    }
  });

  it('refuses a multiInstance database with the caller label', async () => {
    const name = `things${Date.now()}${Math.random().toString(36).slice(2)}`;
    const db = await createRxDatabase({ name, storage: getRxStorageMemory(), multiInstance: true });
    try {
      await expect(openMigratedCollection(db, opener, 10_000)).rejects
        .toThrow('addThings: multiInstance databases are not supported (ADR-061)');
      expect(db.collections.things).toBeUndefined();
    } finally {
      await db.remove();
    }
  });
});
