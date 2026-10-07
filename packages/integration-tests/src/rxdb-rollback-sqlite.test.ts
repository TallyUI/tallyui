// @vitest-environment node
// `pos_orders` storage is one-way at 3.0.0 (docs/DECISIONS.md). The fixture is a till that opened the RxDB 16.21.1 v3
// fixture on 17.5.0 (v4, plus order-0101), was rolled back to 16.21.1 and @tallyui/pos 2.0.0 (which showed no orders, and
// rang order-0102 into a fresh v2 store), and is now upgraded again. `addPosOrderCollection` must recover every order.
import { existsSync } from 'node:fs';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { createRxDatabase } from 'rxdb';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { OrderCreateEnvelope } from '@tallyui/core';
import { readFresh } from '@tallyui/core/rxdb';
import { addPosOrderCollection } from '@tallyui/pos/pos-order/open';
import type { PosOrder } from '@tallyui/pos/pos-order/types';
import { DEFAULT_TAX_ROUNDING } from '@tallyui/pos/tax/exact';
import { createOrderOutbox } from '@tallyui/pos/outbox/order-outbox';
import { loadSQLiteStorage, openNodeSQLite } from '@tallyui/storage-sqlite/node-sqlite.test-helper';

const getRxStorageSQLite = await loadSQLiteStorage();
if (!getRxStorageSQLite && process.env.CI) {
  it('requires rxdb-premium in CI', () => { throw new Error('rxdb-premium is missing in CI'); });
}

const fixture = fileURLToPath(new URL('../fixtures/rollback/pos-orders-rollback.sqlite', import.meta.url));
const snapshots = ['../fixtures/rxdb16/pos-orders-v3.expected.json', '../fixtures/rollback/pos-orders-rollback.expected.json']
  .map((path) => fileURLToPath(new URL(path, import.meta.url)));

/** The file's live `pos_orders` collection records and its `pos_orders` tables, read beneath RxDB, read-only. */
function storedCollections(path: string) {
  const raw = new DatabaseSync(path, { readOnly: true });
  try {
    const records = raw.prepare(`select id from "_rxdb_internal-0" where id like 'collection|pos_orders-%' and deleted = 0 order by id`)
      .all().map((row) => (row as { id: string }).id);
    const tables = raw.prepare(`select name from sqlite_master where type = 'table' and name like 'pos_orders-%' order by name`)
      .all().map((row) => (row as { name: string }).name);
    return { records, tables };
  } finally {
    raw.close();
  }
}

it('the fixture and its snapshots are present', () => {
  for (const path of [fixture, ...snapshots]) expect(existsSync(path), `Missing: ${path}`).toBe(true);
});

(getRxStorageSQLite ? it : it.skip)(
  'after a rollback to 2.0.0, the upgrade recovers every order at v6 on the reopen, field for field, removes the older records, and sends each pending order once',
  async () => {
    const [v3, rollback] = await Promise.all(snapshots.map(async (path) => JSON.parse(await readFile(path, 'utf8')) as PosOrder[]));
    // Plus version 5's sentVersion: order-0007's recorded downgrade, order-0010's figures 3, every other order 1; and
    // version 6's taxRounding, the default every one was computed with.
    const expected = [...v3, ...rollback].map((order) =>
      ({ ...order, sentVersion: order.sentVersion ?? (order.id === 'order-0010' ? 3 : 1), taxRounding: DEFAULT_TAX_ROUNDING }));
    expect(rollback.map((order) => order.id)).toEqual(['order-0101', 'order-0102']);
    // The rollback left order-0102 in a v2 store beside the v4 one, and the v4 store's orders hidden from 2.0.0.
    expect(storedCollections(fixture)).toEqual({ records: ['collection|pos_orders-2', 'collection|pos_orders-4'],
      tables: ['pos_orders-2', 'pos_orders-4'] });

    const directory = await mkdtemp(join(tmpdir(), 'rxdb-rollback-'));
    const copyPath = join(directory, 'orders.sqlite');
    try {
      await copyFile(fixture, copyPath);
      const handle = openNodeSQLite(copyPath);
      const sent: OrderCreateEnvelope[] = [];
      try {
        const db = await createRxDatabase({ name: 'tally_carry',
          storage: wrappedValidateAjvStorage({ storage: getRxStorageSQLite!(handle.database) }), multiInstance: false });
        try {
          // Two older stores (v2 and v4, a main build rolled back): an open migrates one, so the first rejects DM4
          // with the v4 store left, and the reopen recovers the rest (ADR-069). A 2.0.0 till's v2 store takes one open.
          await expect(addPosOrderCollection(db)).rejects.toMatchObject({ code: 'DM4' });
          expect(storedCollections(copyPath).tables).toEqual(['pos_orders-4', 'pos_orders-9']);
          const collection = await addPosOrderCollection(db);
          expect(collection.schema.version).toBe(9);
          expect(await readFresh(collection, { selector: {}, sort: [{ id: 'asc' }] })).toStrictEqual(expected);

          const pending = expected.filter((order) => order.syncStatus === 'pending').map((order) => order.commandId).sort();
          expect(pending).toHaveLength(10);
          const outbox = createOrderOutbox({ collection, deviceId: 'rollback-device', random: () => 0.5, transport: { send: async (batch) => {
            sent.push(...structuredClone(batch));
            return { kind: 'results', results: batch.map((command) => ({ id: command.id, status: 'applied' as const,
              serverRefs: { orderId: `server-${command.id}`, totalMinor: command.payload.totalMinor } })) };
          } } });
          try {
            await outbox.flush();
            await outbox.flush();
          } finally {
            outbox.stop();
          }
          expect(sent.map((command) => command.id).sort()).toEqual(pending);
          expect(await readFresh(collection, { selector: { syncStatus: 'pending' } })).toEqual([]);
        } finally {
          await db.close();
        }
      } finally {
        handle.raw.close();
      }
      // Only the v6 collection record and store are left.
      expect(storedCollections(copyPath)).toEqual({ records: ['collection|pos_orders-9'], tables: ['pos_orders-9'] });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
