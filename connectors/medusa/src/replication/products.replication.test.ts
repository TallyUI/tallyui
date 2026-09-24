// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { replicateRxCollection } from 'rxdb/plugins/replication';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { medusaProductSchema } from '../schemas/products';
import { medusaProductReplication, type MedusaProductCheckpoint } from './products';

addRxPlugin(RxDBDevModePlugin);
const context = { connectorId: 'medusa', baseUrl: 'https://medusa.test', headers: {} };
const stamp = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
const id = (n: number) => `prod_${String(n).padStart(6, '0')}`;
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  vi.restoreAllMocks();
});

async function setup(size: number, tied = false, afterFirstPage?: (rows: Map<string, any>) => void) {
  const rows = new Map(Array.from({ length: size }, (_, i) => [id(i + 1), {
    id: id(i + 1), handle: `product-${i + 1}`, status: 'published',
    title: `Product ${i + 1}`, updated_at: stamp(tied ? 1 : i + 1),
  }]));
  let changed = false;
  const requests: URLSearchParams[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const params = new URL(String(input)).searchParams;
    requests.push(params);
    const offset = Number(params.get('offset') ?? 0);
    const limit = Number(params.get('limit'));
    const bound = params.get('updated_at[$gte]') ?? '';
    const byId = params.get('order') === 'id';
    const matches = [...rows.values()].filter(p => p.updated_at >= bound).sort((a, b) =>
      byId ? a.id.localeCompare(b.id) : b.updated_at.localeCompare(a.updated_at));
    const response = new Response(JSON.stringify({
      products: matches.slice(offset, offset + limit), count: matches.length, offset, limit,
    }));
    if (byId && offset === 0 && !changed) {
      changed = true;
      afterFirstPage?.(rows);
    }
    return response;
  });
  const db = await createRxDatabase({
    name: `medusa${size}${Date.now()}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    multiInstance: false,
  });
  cleanup.push(() => db.close());
  const { products } = await db.addCollections({ products: { schema: medusaProductSchema } });
  const state = replicateRxCollection<any, MedusaProductCheckpoint>({
    collection: products, replicationIdentifier: 'medusa-products',
    live: true, waitForLeadership: false,
    pull: {
      batchSize: 100,
      handler: (checkpoint, batchSize) => medusaProductReplication.pull.handler(checkpoint, batchSize, context),
    },
  });
  cleanup.push(() => state.cancel());
  const errors: unknown[] = [];
  state.error$.subscribe(error => errors.push(error));
  const sync = async () => {
    await state.awaitInSync();
    expect(errors).toEqual([]);
  };
  return { rows, products, state, sync, requests };
}

describe('Medusa product cursor in the real RxDB replication loop', () => {
  it.each([200, 250])('syncs %i products and receives a later update', async (size) => {
    const { rows, products, state, sync } = await setup(size);
    await sync();
    expect(await products.find().exec()).toHaveLength(size);
    Object.assign(rows.get(id(5))!, { title: 'Updated', updated_at: stamp(300) });
    state.reSync();
    await sync();
    expect((await products.findOne(id(5)).exec())?.title).toBe('Updated');
  });

  it('receives both an early and a late row updated after page one', async () => {
    const { products, state, sync } = await setup(250, false, rows => {
      Object.assign(rows.get(id(5))!, { title: 'Early update', updated_at: stamp(300) });
      Object.assign(rows.get(id(240))!, { title: 'Late update', updated_at: stamp(301) });
    });
    await sync();
    state.reSync();
    await sync();
    expect((await products.findOne(id(5)).exec())?.title).toBe('Early update');
    expect((await products.findOne(id(240)).exec())?.title).toBe('Late update');
  });

  it('restarts when 60 already-read rows vanish, preserving every remaining row', async () => {
    const { rows, products, sync, requests } = await setup(250, false, rows => {
      for (let n = 1; n <= 60; n++) rows.delete(id(n));
    });
    await sync();
    const localIds = new Set((await products.find().exec()).map(p => p.id));
    for (const key of rows.keys()) expect(localIds.has(key)).toBe(true);
    expect(requests.filter(p => p.get('order') === 'id').map(p => p.get('offset')))
      .toEqual(['0', '100', '0', '100']);
  });

  it('finishes a pass with 150 tied timestamps and then receives an update', async () => {
    const { rows, products, state, sync, requests } = await setup(150, true);
    await sync();
    expect(await products.find().exec()).toHaveLength(150);
    state.reSync();
    await sync();
    expect(requests.at(-1)?.get('order')).toBe('-updated_at');
    Object.assign(rows.get(id(5))!, { title: 'Updated tie', updated_at: stamp(2) });
    state.reSync();
    await sync();
    expect((await products.findOne(id(5)).exec())?.title).toBe('Updated tie');
  });
});
