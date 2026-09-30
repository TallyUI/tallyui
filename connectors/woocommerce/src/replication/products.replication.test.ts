// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { replicateRxCollection } from 'rxdb/plugins/replication';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { wooProductSchema } from '../schemas/products';
import { wooProductReplication, type WooProductCheckpoint } from './products';

addRxPlugin(RxDBDevModePlugin);
const context = { connectorId: 'woocommerce', baseUrl: 'https://woo.test/wp-json/wcpos/v2', headers: {} };
const stamp = (n: number) => `2026-01-01T08:00:${String(n).padStart(2, '0')}`;
// A GMT time and the store's local time `hours` ahead of it (0: the store's clocks are on GMT).
const at = (gmt: string, hours = 0) => ({
  date_modified_gmt: gmt, date_modified: new Date(Date.parse(`${gmt}Z`) + hours * 3_600_000).toISOString().slice(0, 19),
});
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  vi.restoreAllMocks();
});

// A fake wcpos/v2 products endpoint: the mark request (orderby=modified desc) and id-ordered pages.
// Like WooCommerce, orderby=modified sorts by local time, and modified_after with dates_are_gmt filters on GMT.
// Like WP_Date_Query, a modified_after with Z or an offset is read as site-local digits (utcOffset hours ahead of GMT).
async function setup(size: number, { total = true, filter = true, utcOffset = 0, afterCall = (_call: number, _rows: any[]) => {} } = {}) {
  const rows = Array.from({ length: size }, (_, i) => ({
    id: i + 1, uuid: `u${i + 1}`, name: `Product ${i + 1}`, status: 'publish', ...at(stamp(i + 1), utcOffset),
  }));
  let calls = 0;
  let requests = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    requests++;
    const params = new URL(String(input)).searchParams;
    const sent = filter && params.get('dates_are_gmt') === 'true' ? params.get('modified_after') ?? '' : '';
    const after = /(Z|[+-]\d{2}:\d{2})$/.test(sent) ? at(new Date(sent).toISOString().slice(0, 19), utcOffset).date_modified : sent;
    const byId = params.get('orderby') === 'id';
    const window = rows.filter((p) => p.date_modified_gmt > after).sort((a, b) =>
      byId ? a.id - b.id : b.date_modified.localeCompare(a.date_modified));
    const offset = Number(params.get('offset') ?? 0);
    // The local time only orders the fake; the product schema has no date_modified field.
    const body = JSON.stringify(window.slice(offset, offset + Number(params.get('per_page'))).map(({ date_modified: _, ...p }) => p));
    return new Response(body, { headers: total ? { 'X-WP-Total': String(window.length) } : {} });
  });
  const db = await createRxDatabase({
    name: `woo${size}${Date.now()}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    multiInstance: false,
  });
  cleanup.push(() => db.close());
  const { products } = await db.addCollections({ products: { schema: wooProductSchema } });
  const state = replicateRxCollection<any, WooProductCheckpoint>({
    collection: products, replicationIdentifier: 'woo-products',
    live: true, waitForLeadership: false,
    pull: {
      batchSize: 2,
      handler: async (checkpoint, batchSize) => {
        const result = await wooProductReplication.pull.handler(checkpoint, batchSize, context);
        afterCall(++calls, rows);
        return result;
      },
    },
  });
  cleanup.push(() => state.cancel());
  const errors: unknown[] = [];
  state.error$.subscribe((error) => errors.push(error));
  const sync = async () => {
    await state.awaitInSync();
    expect(errors).toEqual([]);
  };
  const poll = async () => {
    state.reSync();
    await sync();
  };
  const local = async () => new Map((await products.find().exec()).map((p) => [p.uuid, p.toJSON()]));
  // Requests one poll costs, from the stored checkpoint through the end of the run.
  const pollCost = async () => {
    const before = requests;
    await poll();
    return requests - before;
  };
  return { rows, poll, sync, local, pollCost, state, errors };
}

describe('WooCommerce product pass cursor in the real RxDB replication loop', () => {
  it('keeps every product and keeps syncing when already-read products are trashed during the pass', async () => {
    // The reviewer's u6 case: the lowest-id product, already read, is trashed after each of the first four handler calls.
    const { rows, poll, sync, local } = await setup(10, { afterCall: (call, rows) => { if (call <= 4) rows.shift(); } });
    await sync();
    for (let i = 0; i < 10; i++) await poll();

    const synced = await local();
    expect(rows.map((p) => p.uuid).filter((uuid) => !synced.has(uuid))).toEqual([]);

    Object.assign(rows.find((p) => p.id === 8)!, { name: 'Edited', ...at(stamp(30)) });
    await poll();
    expect((await local()).get('u8')?.name).toBe('Edited');
  });

  it('has every remaining product by poll 10 when trashes on every handler call stop after poll 3', async () => {
    let polls = 1;
    const { rows, poll, sync, local } = await setup(20, { afterCall: (_call, rows) => { if (polls <= 3) rows.shift(); } });
    await sync();
    for (polls = 2; polls <= 10; polls++) await poll();

    expect(rows.length).toBeLessThan(18);
    const synced = await local();
    expect(rows.map((p) => p.uuid).filter((uuid) => !synced.has(uuid))).toEqual([]);
  });

  it('receives an edit on the next poll without X-WP-Total when the catalogue is a multiple of the batch size', async () => {
    const { rows, poll, sync, local } = await setup(4, { total: false });
    await sync();
    expect([...(await local()).keys()].sort()).toEqual(['u1', 'u2', 'u3', 'u4']);

    Object.assign(rows[0], { name: 'Edited', ...at(stamp(30)) });
    await poll();
    expect((await local()).get('u1')?.name).toBe('Edited');
  });

  it('a product edited in a repeated daylight-saving hour reaches the till on the next poll', async () => {
    const { rows, poll, sync, local } = await setup(3);
    await sync();
    // Lower bound L = stamp(3). A: local time an hour ahead (before the clocks went back), GMT time below L.
    // B: edited after the clocks went back, so its GMT time is above L but its local time is earlier than A's.
    Object.assign(rows[0], { name: 'A', ...at(stamp(2), 1) });
    Object.assign(rows[1], { name: 'B', ...at(stamp(30)) });
    expect(rows[0].date_modified > rows[1].date_modified && rows[0].date_modified_gmt < stamp(3)).toBe(true);

    await poll();
    expect((await local()).get('u2')?.name).toBe('B');
  });

  it('a quiet poll after a completed pass costs one request', async () => {
    const { sync, pollCost } = await setup(4);
    await sync();

    expect(await pollCost()).toBe(1);
    expect(await pollCost()).toBe(1);
  });

  it('a quiet poll after the most recently edited product is trashed costs one request', async () => {
    const { rows, sync, pollCost } = await setup(4);
    await sync();
    rows.pop();

    expect(await pollCost()).toBe(1);
    expect(await pollCost()).toBe(1);
  });

  it('a quiet poll on a store with no products costs one request', async () => {
    const { sync, local, pollCost } = await setup(0);
    await sync();

    expect(await pollCost()).toBe(1);
    expect(await pollCost()).toBe(1);
    expect((await local()).size).toBe(0);
  });

  it('a store at UTC+02:00 filters on the GMT digits the connector sends', async () => {
    const { rows, poll, sync, local } = await setup(3, { utcOffset: 2 });
    await sync();

    Object.assign(rows[0], { name: 'Edited', ...at(stamp(30), 2) });
    await poll();
    expect((await local()).get('u1')?.name).toBe('Edited');
  });

  it('a store that ignores modified_after surfaces WooDateFilterError instead of syncing silently', async () => {
    const { sync, state, errors } = await setup(3, { filter: false });
    await sync();

    // A quiet poll: the pull handler throws on every retry, so wait for the error rather than for the poll to settle.
    state.reSync();
    await vi.waitFor(() => expect(errors).not.toEqual([]));
    expect((errors[0] as any).parameters.errors[0]).toMatchObject({ name: 'WooDateFilterError', code: 'unsupported_store' });
  });
});
