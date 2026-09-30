// @vitest-environment node
import { existsSync } from 'node:fs';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { CommandResult, OrderCreateEnvelope } from '@tallyui/core';
import { readFresh } from '@tallyui/core/rxdb';
import { commandFingerprint } from '@tallyui/core/server';
import { addPosOrderCollection } from '@tallyui/pos/pos-order/open';
import type { PosOrder } from '@tallyui/pos/pos-order/types';
import { createOrderOutbox, type OrderOutbox } from '@tallyui/pos/outbox/order-outbox';
import type { CommandTransport } from '@tallyui/pos/outbox/types';
import { loadSQLiteStorage, openNodeSQLite } from '@tallyui/storage-sqlite/node-sqlite.test-helper';

const getRxStorageSQLite = await loadSQLiteStorage();
if (!getRxStorageSQLite && process.env.CI) {
  it('requires rxdb-premium in CI', () => { throw new Error('rxdb-premium is missing in CI'); });
}

/** The RxDB version recorded in the file's storage token, read beneath RxDB, read-only. */
function storageTokenVersion(path: string): string {
  const raw = new DatabaseSync(path, { readOnly: true });
  try {
    const row = raw.prepare(`select data from "_rxdb_internal-0" where id = 'storage-token|storageToken'`).get() as { data: string } | undefined;
    return JSON.parse(row!.data).data.rxdbVersion;
  } finally {
    raw.close();
  }
}

const orderIds = Array.from({ length: 10 }, (_, i) => `order-${String(i + 1).padStart(4, '0')}`);

describe.each(['v2', 'v3'])('RxDB 16.21.1 %s carry-over to 17.5.0', (version) => {
  const fixture = fileURLToPath(new URL(`../fixtures/rxdb16/pos-orders-${version}.sqlite`, import.meta.url));
  const snapshot = fileURLToPath(new URL(`../fixtures/rxdb16/pos-orders-${version}.expected.json`, import.meta.url));
  const pendingIds = ['command-1', 'command-10', 'command-2', 'command-3', 'command-6', 'command-7', 'command-8', 'command-9'];
  // order.create versions: order-0007 was downgraded to 2 in the v3 file; order-0007 and order-0010 carry ADR-065's figures.
  const sentVersions = { 'command-1': 1, 'command-2': 1, 'command-3': 1, 'command-6': 1, 'command-8': 1, 'command-9': 1,
    'command-7': version === 'v3' ? 2 : 3, 'command-10': 3 };
  const frozenName = `${'L'.repeat(254)}…`;

  /** Copies the fixture, once its storage token shows RxDB 16.21.1 wrote it, and opens it through `addPosOrderCollection`. */
  async function openCopy(directory: string) {
    expect(storageTokenVersion(fixture)).toBe('16.21.1');
    const copyPath = join(directory, 'orders.sqlite');
    if (!existsSync(copyPath)) await copyFile(fixture, copyPath);
    const handle = openNodeSQLite(copyPath);
    let db: RxDatabase | undefined;
    try {
      db = await createRxDatabase({ name: 'tally_carry',
        storage: wrappedValidateAjvStorage({ storage: getRxStorageSQLite!(handle.database) }), multiInstance: false });
      return { handle, db, collection: await addPosOrderCollection(db) };
    } catch (error) {
      try { await db?.close(); } finally { handle.raw.close(); }
      throw error;
    }
  }

  const applied = (batch: OrderCreateEnvelope[]): CommandResult[] => batch.map((command) => ({ id: command.id, status: 'applied',
    serverRefs: { orderId: `server-${command.id}`, totalMinor: command.payload.totalMinor } }));

  it('the fixture is present', () => {
    expect(existsSync(fixture), `Missing RxDB 16.21.1 fixture: ${fixture}`).toBe(true);
    expect(existsSync(snapshot), `Missing fixture snapshot: ${snapshot}`).toBe(true);
  });

  (getRxStorageSQLite ? it : it.skip).each(['online', 'offline first'])(
    '%s: every order migrates field for field; pending orders are sent exactly once; online stays empty after restart', async (mode) => {
      const expected = JSON.parse(await readFile(snapshot, 'utf8')) as PosOrder[];
      expect(expected.map((order) => order.id)).toEqual(orderIds);
      const directory = await mkdtemp(join(tmpdir(), 'rxdb16-carry-over-'));
      try {
        // The online case reopens the same copy after closing both the database and raw handle.
        for (const restart of mode === 'online' ? [false, true] : [false]) {
          const { handle, db, collection } = await openCopy(directory);
          let outbox: OrderOutbox | undefined;
          try {
            const initial = await readFresh(collection, { selector: {}, sort: [{ id: 'asc' }] });
            if (!restart) {
              // Every migrated order, every field, exactly as RxDB 16.21.1 stored it, plus version 5's sentVersion:
              // the version it went out at (order-0004 and order-0005, with no lines, 1).
              expect(initial).toStrictEqual(expected.map((order) =>
                ({ ...order, sentVersion: (sentVersions as Record<string, number>)[order.commandId] ?? 1 })));
              for (const order of initial) {
                expect(order).not.toHaveProperty('localWarnings');
                expect(order).not.toHaveProperty('serverFailures');
              }
            } else {
              expect(initial.map((order) => [order.id, order.syncStatus]))
                .toEqual(orderIds.map((id) => [id, id === 'order-0005' ? 'rejected' : 'applied']));
            }
            expect(initial[5].lines[0].name).toBe(restart ? frozenName : 'L'.repeat(300));

            const attempts: OrderCreateEnvelope[][] = [];
            const successful: OrderCreateEnvelope[] = [];
            const namesAtSend: string[] = [];
            // Leave the migration on real timers; control only the outbox's retry timers.
            vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
            outbox = createOrderOutbox({ collection, deviceId: 'carry-over-device', random: () => 0.5, initialBackoffMs: 1,
              transport: { send: async (batch) => {
                attempts.push(structuredClone(batch));
                const [older] = await readFresh(collection, { selector: { id: 'order-0006' } });
                namesAtSend.push(older.lines[0].name);
                if (mode === 'offline first' && attempts.length === 1) return { kind: 'retry', reason: 'network' };
                successful.push(...structuredClone(batch));
                return { kind: 'results', results: applied(batch) };
              } },
            });
            for (let flushes = 0; flushes < (mode === 'offline first' ? 20 : 1); flushes++) {
              await outbox.flush();
              if (!(await readFresh(collection, { selector: { syncStatus: 'pending' } })).length) break;
              if (mode === 'offline first') await vi.advanceTimersByTimeAsync(1);
            }

            const stored = await readFresh(collection, { selector: {}, sort: [{ id: 'asc' }] });
            expect(stored.map((order) => [order.id, order.syncStatus]))
              .toEqual(orderIds.map((id) => [id, id === 'order-0005' ? 'rejected' : 'applied']));
            expect(stored[5].lines[0].name).toHaveLength(255);
            if (restart) {
              expect(attempts).toEqual([]);
              continue;
            }

            expect(successful.map((command) => command.id).sort()).toEqual(pendingIds);
            expect(Object.fromEntries(successful.map((command) => [command.id, command.version]))).toStrictEqual(sentVersions);
            const sentIds = attempts.flat().map((command) => command.id);
            expect(sentIds).not.toContain('command-4');
            expect(sentIds).not.toContain('command-5');
            const sentOlder = successful.find((command) => command.id === 'command-6');
            expect(sentOlder).toBeDefined();
            expect(sentOlder!.payload.lines[0].title).toBe(frozenName);
            expect(namesAtSend).toEqual(attempts.map(() => frozenName));
            if (mode === 'offline first') {
              expect(attempts[0].map((command) => command.id).sort()).toEqual(pendingIds);
              const failedOlder = attempts[0].find((command) => command.id === 'command-6');
              expect(failedOlder).toBeDefined();
              expect(commandFingerprint(failedOlder!)).toBe(commandFingerprint(sentOlder!));
            } else {
              expect(sentIds.sort()).toEqual(pendingIds);
            }
          } finally {
            outbox?.stop();
            vi.useRealTimers();
            try { await db.close(); } finally { handle.raw.close(); }
          }
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });

  (getRxStorageSQLite ? it : it.skip)(
    'in flight at the upgrade: the ledger already holds command-1 and answers duplicate with its serverRefs; the till marks it applied once and sends it no more',
    async () => {
      const directory = await mkdtemp(join(tmpdir(), 'rxdb16-carry-over-'));
      // The store applied command-1 before the upgrade; its reply never reached the till.
      const original = { orderId: 'server-order-1', displayId: '#1001', totalMinor: 100 };
      const ledger = new Map<string, NonNullable<CommandResult['serverRefs']>>([['command-1', original]]);
      const sent: string[] = [];
      const send: CommandTransport<OrderCreateEnvelope>['send'] = async (batch) => {
        sent.push(...batch.map((command) => command.id));
        return { kind: 'results', results: batch.map((command) => {
          const known = ledger.get(command.id);
          if (known) return { id: command.id, status: 'duplicate', serverRefs: known };
          const [result] = applied([command]);
          ledger.set(command.id, result.serverRefs!);
          return result;
        }) };
      };
      try {
        for (const restart of [false, true]) {
          const { handle, db, collection } = await openCopy(directory);
          const writes: Array<PosOrder['syncStatus']> = [];
          const subscription = (collection as RxCollection<PosOrder>).$.subscribe((event) => {
            if (event.documentId === 'order-0001') writes.push(event.documentData.syncStatus);
          });
          const outbox = createOrderOutbox({ collection, deviceId: 'carry-over-device', random: () => 0.5, transport: { send } });
          try {
            await outbox.flush();
            await outbox.flush();
            const [first] = await readFresh(collection, { selector: { id: 'order-0001' } });
            expect(first.syncStatus).toBe('applied');
            expect(first.serverRefs).toStrictEqual(original);
            expect(writes).toEqual(restart ? [] : ['applied']);
            expect(sent.filter((id) => id === 'command-1')).toEqual(['command-1']);
            expect([...sent].sort()).toEqual(pendingIds);
          } finally {
            subscription.unsubscribe();
            outbox.stop();
            try { await db.close(); } finally { handle.raw.close(); }
          }
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
});
