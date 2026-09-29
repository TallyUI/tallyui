// @vitest-environment node
import { existsSync } from 'node:fs';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { OrderCreateEnvelope } from '@tallyui/core';
import { readFresh } from '@tallyui/core/rxdb';
import { commandFingerprint } from '@tallyui/core/server';
import { addPosOrderCollection } from '@tallyui/pos/pos-order/open';
import { createOrderOutbox, type OrderOutbox } from '@tallyui/pos/outbox/order-outbox';
import { loadSQLiteStorage, openNodeSQLite } from '@tallyui/storage-sqlite/node-sqlite.test-helper';

const getRxStorageSQLite = await loadSQLiteStorage();
if (!getRxStorageSQLite && process.env.CI) {
  it('requires rxdb-premium in CI', () => { throw new Error('rxdb-premium is missing in CI'); });
}

describe.each(['v2', 'v3'])('RxDB 16.21.1 %s carry-over to 17.5.0', (version) => {
  const fixture = fileURLToPath(new URL(`../fixtures/rxdb16/pos-orders-${version}.sqlite`, import.meta.url));
  const pendingIds = ['command-1', 'command-2', 'command-3', 'command-6'];
  const frozenName = `${'L'.repeat(254)}…`;

  it('the fixture is present', () => {
    expect(existsSync(fixture), `Missing RxDB 16.21.1 fixture: ${fixture}`).toBe(true);
  });

  (getRxStorageSQLite ? it : it.skip).each(['online', 'offline first'])(
    '%s: sends pending orders exactly once; online stays empty after restart', async (mode) => {
      const directory = await mkdtemp(join(tmpdir(), 'rxdb16-carry-over-'));
      const copyPath = join(directory, 'orders.sqlite');
      try {
        await copyFile(fixture, copyPath);
        // The online case reopens the same copy after closing both the database and raw handle.
        for (const restart of mode === 'online' ? [false, true] : [false]) {
          const handle = openNodeSQLite(copyPath);
          let db: RxDatabase | undefined;
          let outbox: OrderOutbox | undefined;
          try {
            db = await createRxDatabase({ name: 'tally_carry',
              storage: wrappedValidateAjvStorage({ storage: getRxStorageSQLite!(handle.database) }), multiInstance: false });
            const collection = await addPosOrderCollection(db);
            const initial = await readFresh(collection, { selector: {}, sort: [{ id: 'asc' }] });
            expect(initial.map((order) => order.id)).toEqual([
              'order-0001', 'order-0002', 'order-0003', 'order-0004', 'order-0005', 'order-0006',
            ]);
            expect(initial.map((order) => order.syncStatus)).toEqual(restart
              ? ['applied', 'applied', 'applied', 'applied', 'rejected', 'applied']
              : ['pending', 'pending', 'pending', 'applied', 'rejected', 'pending']);
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
                return { kind: 'results', results: batch.map((command) => ({ id: command.id, status: 'applied',
                  serverRefs: { orderId: `server-${command.id}`, totalMinor: command.payload.totalMinor } })) };
              } },
            });
            for (let flushes = 0; flushes < (mode === 'offline first' ? 20 : 1); flushes++) {
              await outbox.flush();
              if (!(await readFresh(collection, { selector: { syncStatus: 'pending' } })).length) break;
              if (mode === 'offline first') await vi.advanceTimersByTimeAsync(1);
            }

            const stored = await readFresh(collection, { selector: {}, sort: [{ id: 'asc' }] });
            expect(stored.map((order) => [order.id, order.syncStatus])).toEqual([
              ['order-0001', 'applied'], ['order-0002', 'applied'], ['order-0003', 'applied'],
              ['order-0004', 'applied'], ['order-0005', 'rejected'], ['order-0006', 'applied'],
            ]);
            expect(stored[5].lines[0].name).toHaveLength(255);
            if (restart) {
              expect(attempts).toEqual([]);
              continue;
            }

            expect(successful.map((command) => command.id).sort()).toEqual(pendingIds);
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
            try { await db?.close(); } finally { handle.raw.close(); }
          }
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
});
