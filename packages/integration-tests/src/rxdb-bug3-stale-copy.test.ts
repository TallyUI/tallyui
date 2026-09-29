// @vitest-environment node
import { expect, it } from 'vitest';
import { addRxPlugin, createRxDatabase, fillWithDefaultSettings } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { now } from 'rxdb/plugins/utils';

addRxPlugin(RxDBMigrationSchemaPlugin);

it('RxDB 17.5.0 bug 3: a stale current-version copy no longer stops the migration, but the copy wins over the older state', async () => {
  const storage = getRxStorageMemory();
  const name = `bugthree${Date.now()}`;
  const schema = {
    version: 0, primaryKey: 'id', type: 'object',
    properties: { id: { type: 'string', maxLength: 36 }, status: { type: 'string' } },
    required: ['id', 'status'],
  } as const;
  const before = await createRxDatabase({ name, storage, multiInstance: false });
  try {
    const { docs } = await before.addCollections({ docs: { schema } });
    await docs.insert({ id: 'a', status: 'sent' });
  } finally {
    await before.close();
  }

  const currentSchema = { ...schema, version: 1 };
  const raw = await storage.createStorageInstance<{ id: string; status: string }>({
    databaseName: name, collectionName: 'docs', schema: fillWithDefaultSettings(currentSchema),
    options: {}, multiInstance: false, devMode: false, databaseInstanceToken: 'stale-copy',
  });
  try {
    const result = await raw.bulkWrite([{ document: {
      id: 'a', status: 'pending', _deleted: false, _attachments: {},
      _rev: '1-stale-copy', _meta: { lwt: now() },
    } }], 'seed-stale-copy');
    expect(result.error).toEqual([]);
  } finally {
    await raw.close();
  }

  const after = await createRxDatabase({ name, storage, multiInstance: false });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { docs } = await after.addCollections({ docs: {
      schema: currentSchema, migrationStrategies: { 1: (d) => d }, autoMigrate: false,
    } });
    const migration = docs.getMigrationState();
    const result = await Promise.race([
      migration.startMigration().then(() => 'finished'),
      new Promise<'timer'>((resolve) => { timer = setTimeout(() => resolve('timer'), 2000); }),
    ]);
    expect(result).toBe('finished');
    expect((await migration.getStatus()).status).toBe('DONE');
    // If this becomes 'sent', RxDB stopped keeping the stale copy: review open.ts's writeOverStaleCopies.
    expect((await docs.findOne('a').exec())?.status).toBe('pending');
  } finally {
    clearTimeout(timer);
    await after.close();
  }
});
