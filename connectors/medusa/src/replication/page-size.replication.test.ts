// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { connectorCollection, startReplication } from '@tallyui/database';
import { createMedusaConnector } from '../index';
import { medusaProductSchema } from '../schemas/products';

addRxPlugin(RxDBDevModePlugin);
const context = { connectorId: 'medusa', baseUrl: 'https://medusa.test', headers: {} };
const stamp = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  vi.restoreAllMocks();
});

async function setup() {
  const rows = Array.from({ length: 1050 }, (_, i) => ({
    id: `prod_${String(i + 1).padStart(6, '0')}`, handle: `product-${i + 1}`, status: 'published',
    title: `Product ${i + 1}`, updated_at: stamp(i + 1),
  }));
  const requests: URL[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    const params = url.searchParams;
    if (url.pathname === '/admin/products' && params.get('order') === 'id') {
      const offset = Number(params.get('offset') ?? 0);
      const limit = Number(params.get('limit'));
      return new Response(JSON.stringify({
        products: [...rows].sort((a, b) => a.id.localeCompare(b.id)).slice(offset, offset + limit),
        count: rows.length, offset, limit,
      }));
    }
    if (url.pathname === '/admin/products' && params.get('order') === '-updated_at') {
      return new Response(JSON.stringify({ products: [rows.at(-1)], count: rows.length }));
    }
    if (url.pathname === '/admin/product-variants' && params.get('limit') === '1') {
      return new Response(JSON.stringify({ variants: [{ id: 'variant_1', updated_at: stamp(1) }], count: 1 }));
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  const db = await createRxDatabase({
    name: `medusapagesize${Date.now()}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    multiInstance: false,
  });
  cleanup.push(() => db.close());
  const { products } = await db.addCollections({ products: connectorCollection(medusaProductSchema) });
  const state = startReplication({ collection: products, adapter: createMedusaConnector().replication!.products!, context });
  cleanup.push(() => state.cancel());
  const errors: unknown[] = [];
  state.error$.subscribe(error => errors.push(error));
  await state.awaitInSync();
  expect(errors).toEqual([]);
  return { products, requests };
}

describe('Medusa combined pull page size in the real RxDB replication loop', () => {
  it('pulls 1,050 products in five 250-product list pages', async () => {
    const { products, requests } = await setup();
    expect(await products.find().exec()).toHaveLength(1050);
    const pages = requests.filter(url => url.pathname === '/admin/products' && url.searchParams.get('order') === 'id');
    expect(pages.map(url => url.searchParams.get('limit'))).toEqual(['250', '250', '250', '250', '250']);
    expect(pages.map(url => url.searchParams.get('offset'))).toEqual(['0', '250', '500', '750', '1000']);
  });

  it('reads the variant mark once per pull call for five 250-product list pages, plus the fresh-install seed', async () => {
    const { requests } = await setup();
    expect(requests.filter(url => url.pathname === '/admin/product-variants'), requests.map(String).join('\n'))
      .toHaveLength(6);
  });
});
