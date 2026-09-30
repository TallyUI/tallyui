// #242, the release gate's first box: a database written by the 2.0.0 build (RxDB and Premium 16.21.1,
// its storage worker and main thread) on SQLite-wasm over OPFS (SAH pool), opened by this tree's
// 17.5.0 build, in real Chromium. One server serves /v16/, /v17/ and /mixed/ on one origin, and each
// test drives one BrowserContext, so the pages share one OPFS (page/build-and-serve.mjs).
//
// Setup, once per machine (the 2.0.0 tree sits beside this worktree; nothing here is published):
//   git worktree add --detach <v16 tree> @tallyui/storage-sqlite@2.0.0
//   ~/.claude/bin/rxdb-premium-install.sh "<v16 tree>" --frozen-lockfile     (and the same for this tree)
//   pnpm --filter @tallyui/storage-sqlite build                             (in both trees)
// Run:
//   E2E_V16_TREE=<v16 tree> pnpm exec playwright test --project storage-sqlite-upgrade --workers=1 --reporter=list
// Without E2E_V16_TREE the project and its server are left out of the config, so CI never runs it.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

const root = path.resolve(__dirname, '../..');
const v16Tree = process.env.E2E_V16_TREE ?? '';
const premiumInstalled = (tree: string) => existsSync(path.join(tree, 'packages/storage-sqlite/node_modules/rxdb-premium'));
const ready = !!v16Tree && premiumInstalled(root) && premiumInstalled(v16Tree);

// The node:sqlite carry-over test's order set and expectations (packages/integration-tests/src/rxdb16-carry-over-sqlite.test.ts):
// the ten orders RxDB 16.21.1 stored through @tallyui/pos 2.0.0's schema (version 2), without _meta and _rev.
const expectedPath = path.join(root, 'packages/integration-tests/fixtures/rxdb16/pos-orders-v2.expected.json');
const expected = ready ? JSON.parse(readFileSync(expectedPath, 'utf8')) as Array<Record<string, unknown>> : [];
const orderIds = Array.from({ length: 10 }, (_, i) => `order-${String(i + 1).padStart(4, '0')}`);
const pendingIds = ['command-1', 'command-10', 'command-2', 'command-3', 'command-6', 'command-7', 'command-8', 'command-9'];
// order.create versions for the v2 set, as the carry-over test has them: order-0007 and order-0010 carry ADR-065's figures.
const sentVersions = { 'command-1': 1, 'command-2': 1, 'command-3': 1, 'command-6': 1, 'command-8': 1, 'command-9': 1, 'command-7': 3, 'command-10': 3 };
// The orders after the v2 → v5 migration, as the carry-over test has them: every field RxDB 16.21.1 stored, plus
// version 5's sentVersion, the version it went out at (order-0004 and order-0005, with no lines, 1).
const migrated = expected.map((order) => ({ ...order, sentVersion: (sentVersions as Record<string, number>)[order.commandId as string] ?? 1 }));
// order-0006's 300-character line name, frozen to the sent form when it is sent.
const frozenName = `${'L'.repeat(254)}…`;
const DB_NAME = 'tally_upgrade';

type Attempt = { id: string; version: number; firstTitle?: string }[];

const tally = <T>(page: Page, call: string, ...args: unknown[]): Promise<T> =>
  page.evaluate(([fn, rest]) => (window as any).tally[fn as string](...(rest as unknown[])), [call, args] as const);

async function timed<T>(label: string, work: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const value = await work();
  // eslint-disable-next-line no-console
  console.log(`[storage-sqlite-upgrade] ${label}: ${Date.now() - start}ms`);
  return value;
}

/** The 2.0.0 till: writes the fixture orders and its register state, and returns what it stored. */
async function writeWithV16(page: Page) {
  await page.goto('/v16/');
  const written = await timed('2.0.0 write', () => tally<any>(page, 'write', DB_NAME, expected));
  expect(written.rxdbVersion).toBe('16.21.1');
  // What 16.21.1 stored on OPFS is what it stored on node:sqlite for the fixture.
  expect(written.orders).toStrictEqual(expected);
  expect(written.register.stores['store-1']).toMatchObject({ register_id: 'register-1', register_name: 'Till 1', sale_counter: 1 });
  expect(written.sessions).toHaveLength(1);
  expect(written.sessions[0]).toMatchObject({ register_id: 'register-1', status: 'open', counted_float_minor: 10000 });
  expect(written.movements).toHaveLength(1);
  expect(written.movements[0]).toMatchObject({ session_id: written.sessions[0].id, type: 'paid_in', amountMinor: 500 });
  return written;
}

test.describe('storage-sqlite 16.21.1 → 17.5.0 upgrade on SQLite-wasm over OPFS (SAH pool), real Chromium (#242)', () => {
  test.skip(!ready, 'needs E2E_V16_TREE (a built @tallyui/storage-sqlite@2.0.0 checkout) and rxdb-premium installed in both trees');

  test('a 2.0.0-written database opens on 17.5.0: every document survives, each pending order is sent exactly once, and a reload sends nothing', async ({ page }) => {
    test.setTimeout(120_000);
    const written = await test.step('2.0.0 writes the fixture orders and the register state', () => writeWithV16(page));

    await test.step('17.5.0 opens the same database and every document survives the v2 → v5 migration', async () => {
      await page.goto('/v17/');
      // The 2.0.0 worker's SAH pool (VFS `tallyui`) is in this origin's OPFS, where the 17.5.0 worker installs the same pool.
      expect(await tally<string[]>(page, 'opfsRoot')).toEqual(['.tallyui']);
      const opened = await timed('17.5.0 open with migration', () => tally<any>(page, 'open', DB_NAME));
      expect(opened, JSON.stringify(opened)).toMatchObject({ ok: true, rxdbVersion: '17.5.0', worker: '/v17/tallyui-sqlite-worker.js', ordersSchemaVersion: 5 });
      const stored = await tally<any>(page, 'readAll');
      expect(stored.orders.map((order: { id: string }) => order.id)).toEqual(orderIds);
      // Every migrated order, every field, exactly as RxDB 16.21.1 stored it, plus version 5's sentVersion; nothing else added.
      expect(stored.orders).toStrictEqual(migrated);
      for (const order of stored.orders) {
        expect(order).not.toHaveProperty('localWarnings');
        expect(order).not.toHaveProperty('serverFailures');
      }
      expect(stored.orders[5].lines[0].name).toBe('L'.repeat(300));
      // The register state 2.0.0 keeps in RxDB, unchanged (its schemas are version 0 on both sides).
      expect(stored.register).toStrictEqual(written.register);
      expect(stored.sessions).toStrictEqual(written.sessions);
      expect(stored.movements).toStrictEqual(written.movements);
      expect(stored.closures).toStrictEqual(written.closures);
    });

    await test.step('the outbox sends each pending order exactly once, and never the applied or rejected one', async () => {
      const attempts = await timed('17.5.0 first flush', () => tally<Attempt[]>(page, 'flush'));
      const sent = attempts.flat();
      // eslint-disable-next-line no-console
      console.log(`[storage-sqlite-upgrade] first flush sent ${sent.length} commands in ${attempts.length} batch(es): ${sent.map((c) => c.id).join(', ')}`);
      expect(sent.map((command) => command.id).sort()).toEqual(pendingIds);
      expect(new Set(sent.map((command) => command.id)).size).toBe(sent.length);
      expect(sent.map((command) => command.id)).not.toContain('command-4');
      expect(sent.map((command) => command.id)).not.toContain('command-5');
      expect(Object.fromEntries(sent.map((command) => [command.id, command.version]))).toStrictEqual(sentVersions);
      expect(sent.find((command) => command.id === 'command-6')?.firstTitle).toBe(frozenName);
      const stored = await tally<any>(page, 'readAll');
      expect(stored.orders.map((order: { id: string; syncStatus: string }) => [order.id, order.syncStatus]))
        .toEqual(orderIds.map((id) => [id, id === 'order-0005' ? 'rejected' : 'applied']));
      expect(stored.orders[5].lines[0].name).toHaveLength(255);
      // Each sent order keeps its sentVersion stored: the version it went out at. The fake transport advertises no
      // order.create max, so none is 4.
      const storedSent = Object.fromEntries(stored.orders
        .filter((order: { commandId: string }) => pendingIds.includes(order.commandId))
        .map((order: { commandId: string; sentVersion?: number }) => [order.commandId, order.sentVersion]));
      expect(storedSent).toStrictEqual(sentVersions);
      for (const version of Object.values(storedSent)) expect(version).toBeLessThanOrEqual(3);
    });

    await test.step('after a reload, the 17.5.0 till reopens and a second flush sends nothing', async () => {
      await page.reload();
      const reopened = await timed('17.5.0 reopen after reload', () => tally<any>(page, 'open', DB_NAME));
      expect(reopened, JSON.stringify(reopened)).toMatchObject({ ok: true, rxdbVersion: '17.5.0' });
      const stored = await tally<any>(page, 'readAll');
      expect(stored.orders.map((order: { id: string; syncStatus: string }) => [order.id, order.syncStatus]))
        .toEqual(orderIds.map((id) => [id, id === 'order-0005' ? 'rejected' : 'applied']));
      expect(stored.sessions).toStrictEqual(written.sessions);
      expect(await tally<Attempt[]>(page, 'flush')).toEqual([]);
    });
  });

  test('a stale 16.21.1 storage worker under the 17.5.0 main thread fails loudly, and the database is untouched', async ({ page }) => {
    test.setTimeout(120_000);
    await test.step('2.0.0 writes the fixture orders and the register state', () => writeWithV16(page));

    await test.step('the 17.5.0 main thread with the cached 2.0.0 worker refuses to open, with an error the app sees', async () => {
      await page.goto('/mixed/');
      const result = await timed('mixed open', () => tally<any>(page, 'open', DB_NAME));
      // eslint-disable-next-line no-console
      console.log(`[storage-sqlite-upgrade] stale-worker error: ${JSON.stringify(result, null, 2)}`);
      expect(result.ok, 'the stale worker opened the database').toBe(false);
      expect(result.hung, 'the stale worker hung instead of failing').toBe(false);
      expect(result.worker).toBe('/v16/tallyui-sqlite-worker.js');
      // createRxDatabase rejects: RxDB's remote storage refuses a worker of another RxDB version (RM1), naming both versions.
      expect(result.message).toContain('could not create instance');
      expect(result.message).toContain('"code":"RM1"');
      expect(result.message).toContain('"mainVersion":"17.5.0","remoteVersion":"16.21.1"');
      // `isStorageWorkerStartError` classifies RM1 as a failed start (#280), so the app shows its reload advice.
      expect(result.isStorageWorkerStartError).toBe(true);
    });

    await test.step('the 17.5.0 build then opens the untouched 2.0.0 database with every order', async () => {
      await page.goto('/v17/');
      const opened = await tally<any>(page, 'open', DB_NAME);
      expect(opened, JSON.stringify(opened)).toMatchObject({ ok: true, rxdbVersion: '17.5.0' });
      const stored = await tally<any>(page, 'readAll');
      expect(stored.orders).toStrictEqual(migrated);
    });
  });
});
