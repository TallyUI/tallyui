// @vitest-environment node
// Ported from WCPOS `next` `3b5331b5c` `register-document.test.ts` (ADR-032 amendment 1). The
// document lives on `register_sessions` (`registerSessionCollection`), and a site UUID plus a
// numeric store id become one neutral `storeKey`: WCPOS's 'site' is the store key 'site'.
//
// Dropped:
//   - 'completion metadata is retained on retry without incrementing the counter' and
//     'completion uses the bound register, not the till: %j': WCPOS's checkout `completionMeta`
//     stamps WooCommerce order meta; TallyUI's sale carries `registerId`/`sessionId` instead.
//   - 'rejects another store pointer after hydration without resetting the site counter',
//     'does not unbind a pointer another store of the site has written' and 'accepts a legacy
//     pointer until the next bind records its store': WooCommerce-only (several stores sharing
//     one site's bucket, and WCPOS's legacy pointers); a store key is one bucket per store.
//   - 'mints unique closure numbers after the adopted floor, independently by site', 'only raises
//     each counter and adds perpetual amounts in minor units', 'keeps register B independent of A
//     and ignores legacy site counters', 'a re-mint after adopting a newer server floor carries the
//     period exactly once' and 'readCounters refuses payloads that cannot serve as a floor':
//     `adoptCounters`/`readCounters` (the server's counters) move to registers job c. The first's
//     concurrency check is kept below without the adopted floor.
// Changed: 'caches the register identity ...' reads the document instead of WCPOS's module-level
// `getRegisterId()`, which is not ported (global state; callers pass the host).
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import {
  advancePerpetual,
  bindRegister,
  ensureRegister,
  getBoundRegisterId,
  mintClosureNumber,
  nextSaleCounter,
  readBoundRegister,
  readRegister,
  unbindRegister,
} from './register-document';
import { registerSessionCollection } from './schemas';
import type { RegisterSessionCollection } from './session-store';

let database: RxDatabase<{ register_sessions: RegisterSessionCollection }>;
let db: RegisterSessionCollection;
beforeEach(async () => {
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('abcdef00-0000-4000-8000-00000000abcd');
  database = await createRxDatabase({
    name: `register${Math.random().toString(36).slice(2)}`,
    storage: getRxStorageMemory(),
    multiInstance: false,
  });
  ({ register_sessions: db } = await database.addCollections({ register_sessions: registerSessionCollection() }));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await database.remove();
});
it('mints once, including concurrent hydration, and reuses the document', async () => {
  const [first, second] = await Promise.all([ensureRegister(db, 'web'), ensureRegister(db, 'web')]);
  expect(first).toEqual(second);
  expect(await ensureRegister(db, 'web')).toEqual(first);
  expect(first.id).toBe(first.id.toLowerCase());
  expect(first.name).toBe('Register ABCD');
  expect(first.platform).toBe('web');
  expect(first.stores).toEqual({});
});
it('increments atomically without duplicate counters', async () => {
  await ensureRegister(db, 'web');
  for (const counter of [1, 2, 3]) expect(await nextSaleCounter(db, 'site')).toBe(counter);
  expect(
    (await Promise.all([nextSaleCounter(db, 'site'), nextSaleCounter(db, 'site')])).sort()
  ).toEqual([4, 5]);
});

it('returns each assigned counter even when RxDB batches concurrent modifiers', async () => {
  await ensureRegister(db, 'web');
  const counters = await Promise.all(Array.from({ length: 10 }, () => nextSaleCounter(db, 'site')));
  expect(counters.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

it('counts sites independently without changing the global identity', async () => {
  const register = await ensureRegister(db, 'web');
  for (const counter of [1, 2, 3]) {
    expect(await nextSaleCounter(db, 'site')).toBe(counter);
    expect(await nextSaleCounter(db, 'other')).toBe(counter);
  }
  expect(await readRegister(db)).toMatchObject({
    id: register.id,
    stores: { site: { sale_counter: 3 }, other: { sale_counter: 3 } },
  });
});

it('caches the register identity and mints v4 with random bytes when randomUUID is absent', async () => {
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(undefined as never);
  const register = await ensureRegister(db, 'web');
  expect(register.id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
  expect(await readRegister(db)).toEqual(register);
  expect(await ensureRegister(db, 'web')).toEqual(register);
});

it('binds and unbinds independently per site without changing counters or the till', async () => {
  const till = await ensureRegister(db, 'web');
  expect(await readBoundRegister(db, 'site')).toBeNull();
  await bindRegister(db, 'site', { id: 'drawer-a', name: 'Front' });
  await bindRegister(db, 'other', { id: 'drawer-b', name: 'Back' });
  expect(await nextSaleCounter(db, 'site')).toBe(1);
  expect(await nextSaleCounter(db, 'site')).toBe(2);
  expect(await nextSaleCounter(db, 'other')).toBe(1);
  expect(await readBoundRegister(db, 'site')).toEqual({ id: 'drawer-a', name: 'Front' });
  expect(await readBoundRegister(db, 'other')).toEqual({ id: 'drawer-b', name: 'Back' });
  expect(getBoundRegisterId(await readRegister(db), 'site')).toBe('drawer-a');
  await unbindRegister(db, 'site');
  expect(await readBoundRegister(db, 'site')).toBeNull();
  expect(getBoundRegisterId(await readRegister(db), 'site')).toBeNull();
  expect(getBoundRegisterId(await readRegister(db), 'other')).toBe('drawer-b');
  expect(await nextSaleCounter(db, 'site')).toBe(3);
  expect((await readRegister(db))?.id).toBe(till.id);
});

// TallyUI: WCPOS's concurrent-mint check, without the server floor (job c).
it('mints unique closure numbers concurrently, independently by store, and adds each plain period once', async () => {
  await ensureRegister(db, 'web');
  expect(
    (await Promise.all(Array.from({ length: 10 }, () => mintClosureNumber(db, 'site', 'a')))).sort((a, b) => a - b)
  ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect(await mintClosureNumber(db, 'other', 'a')).toBe(1);
  await advancePerpetual(db, 'site', 'a', { salesMinor: 2000, refundsMinor: 1 });
  await advancePerpetual(db, 'site', 'a', { salesMinor: 30, refundsMinor: 0 });
  expect((await readRegister(db))?.stores.site.registers?.a).toMatchObject({
    last_closure_number: 10,
    perpetual_sales_total_minor: 2030,
    perpetual_refunds_total_minor: 1,
  });
});
