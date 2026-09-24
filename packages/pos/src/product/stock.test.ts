import { describe, it, expect, afterEach } from 'vitest';
import { createRxDatabase, addRxPlugin, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { firstValueFrom, filter } from 'rxjs';
import { createVendureConnector } from '@tallyui/connector-vendure';
import { STOCK_LEVELS_COLLECTION, stockLevelsSchema } from '@tallyui/database';

import { getProductStock, stockOverlay$, withStockOverlay } from './stock';

addRxPlugin(RxDBDevModePlugin);

const { traits, reconcile } = createVendureConnector();
const adapter = reconcile!.stock!;
const level = (stockOnHand: number, stockAllocated = 0) => ({ stockLocationId: '1', stockOnHand, stockAllocated });
const doc = {
  id: 'p1',
  name: 'Mug',
  variants: [
    { id: 'v1', stockLevels: [level(5)] },
    { id: 'v2', stockLevels: [level(3, 1)] },
  ],
};

describe('withStockOverlay', () => {
  it('returns the same object without an adapter, an overlay or a difference', () => {
    expect(withStockOverlay(doc, undefined, new Map([['v1', [level(0)]]]))).toBe(doc);
    expect(withStockOverlay(doc, adapter, undefined)).toBe(doc);
    expect(withStockOverlay(doc, adapter, new Map([['v1', [level(5)]], ['other', [level(0)]]]))).toBe(doc);
  });

  it('returns a merged copy and leaves the input alone', () => {
    const before = structuredClone(doc);
    const view = withStockOverlay(doc, adapter, new Map([['v2', [level(9)]]]));
    expect(view).not.toBe(doc);
    expect(view).toEqual({ ...doc, variants: [doc.variants[0], { id: 'v2', stockLevels: [level(9)] }] });
    expect(doc).toEqual(before);
  });
});

describe('getProductStock', () => {
  it('uses the overlay where it has an entry and the replicated stock elsewhere', () => {
    expect(getProductStock(doc, traits.product, adapter, undefined)).toEqual({ status: 'in_stock', quantity: 7 });
    // v1 from the overlay (0), v2 from the document (3 - 1).
    expect(getProductStock(doc, traits.product, adapter, new Map([['v1', [level(0)]]])))
      .toEqual({ status: 'in_stock', quantity: 2 });
    expect(getProductStock(doc, traits.product, adapter, new Map([['v1', [level(0)]], ['v2', [level(1, 1)]]])))
      .toEqual({ status: 'out_of_stock', quantity: 0 });
  });
});

describe('stockOverlay$', () => {
  let db: RxDatabase | undefined;
  afterEach(async () => { await db?.close(); });

  it('emits a map of key to value that updates after an upsert', async () => {
    db = await createRxDatabase({
      name: `overlay_${Math.random().toString(36).slice(2)}`, multiInstance: false,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    });
    await db.addCollections({ [STOCK_LEVELS_COLLECTION]: { schema: stockLevelsSchema } });
    const collection = db[STOCK_LEVELS_COLLECTION];
    const updatedAt = new Date().toISOString();
    await collection.insert({ id: 'v1', value: [level(5)], updatedAt });

    const overlay$ = stockOverlay$(collection);
    expect(await firstValueFrom(overlay$)).toEqual(new Map([['v1', [level(5)]]]));
    const next = firstValueFrom(overlay$.pipe(filter((map) => map.size === 2 && (map.get('v1') as any[])[0].stockOnHand === 2)));
    await collection.bulkUpsert([{ id: 'v1', value: [level(2)], updatedAt }, { id: 'v2', value: [level(1)], updatedAt }]);
    expect(await next).toEqual(new Map([['v1', [level(2)]], ['v2', [level(1)]]]));
  });
});
