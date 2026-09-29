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
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  vi.restoreAllMocks();
});

// A fake wcpos/v2 products endpoint: the mark request (orderby=modified desc) and id-ordered pages.
async function setup(size: number, { total = true, afterCall = (_call: number, _rows: any[]) => {} } = {}) {
  const rows = Array.from({ length: size }, (_, i) => ({
    id: i + 1, uuid: `u${i + 1}`, name: `Product ${i + 1}`, status: 'publish', date_modified_gmt: stamp(i + 1),
  }));
  let calls = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const params = new URL(String(input)).searchParams;
    const after = params.get('dates_are_gmt') === 'true' ? params.get('modified_after') ?? '' : '';
    const byId = params.get('orderby') === 'id';
    const window = rows.filter((p) => p.date_modified_gmt > after).sort((a, b) =>
      byId ? a.id - b.id : b.date_modified_gmt.localeCompare(a.date_modified_gmt));
    const offset = Number(params.get('offset') ?? 0);
    const body = JSON.stringify(window.slice(offset, offset + Number(params.get('per_page'))));
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
  return { rows, poll, sync, local };
}

describe('WooCommerce product pass cursor in the real RxDB replication loop', () => {
  it('keeps every product and keeps syncing when already-read products are trashed during the pass', async () => {
    // The reviewer's u6 case: the lowest-id product, already read, is trashed after each of the first four handler calls.
    const { rows, poll, sync, local } = await setup(10, { afterCall: (call, rows) => { if (call <= 4) rows.shift(); } });
    await sync();
    for (let i = 0; i < 10; i++) await poll();

    const synced = await local();
    expect(rows.map((p) => p.uuid).filter((uuid) => !synced.has(uuid))).toEqual([]);

    Object.assign(rows.find((p) => p.id === 8)!, { name: 'Edited', date_modified_gmt: stamp(30) });
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

    Object.assign(rows[0], { name: 'Edited', date_modified_gmt: stamp(30) });
    await poll();
    expect((await local()).get('u1')?.name).toBe('Edited');
  });
});
