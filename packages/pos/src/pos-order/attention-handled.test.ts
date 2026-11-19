// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { markAttentionHandled, needsAttention, posOrderCollection, uuidv7, type PosOrder } from '../index';

let db: RxDatabase<{ pos_orders: RxCollection<PosOrder> }>;
let collection: RxCollection<PosOrder>;
const createdAt = '2026-11-19T12:00:00.000Z';

function order(fields: Partial<PosOrder> = {}): PosOrder {
  return {
    id: uuidv7(), commandId: uuidv7(), createdAt, updatedAt: createdAt, currency: 'EUR', pricesIncludeTax: false,
    lines: [{ id: uuidv7(), productId: 'product-1', name: 'Item 1', sku: 'SKU1', quantity: 1,
      unitPriceMinor: 100, discountMinor: 0, netMinor: 100, taxLines: [] }],
    payments: [{ id: uuidv7(), method: 'cash', amountMinor: 100 }], customer: null,
    subtotalMinor: 100, discountMinor: 0, taxMinor: 0, totalMinor: 100, syncStatus: 'pending',
    taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' }, ...fields,
  };
}
const stored = async (id: string) => (await collection.findOne(id).exec())!.toJSON() as PosOrder;
const attention = async () => needsAttention((await collection.find().exec()).map((row) => row.toJSON() as PosOrder));

beforeEach(async () => {
  db = await createRxDatabase({ name: `handled${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  ({ pos_orders: collection } = await db.addCollections({ pos_orders: posOrderCollection() }));
});
afterEach(async () => { await db.remove(); });

describe('markAttentionHandled (ADR-092 6f)', () => {
  it('H1 stamps a rejected order for its commandId, and needsAttention no longer lists it', async () => {
    const input = order({ syncStatus: 'rejected', error: { code: 'payment_declined', message: 'Refused' } });
    await collection.insert(input);
    expect((await attention()).map(({ id }) => id)).toEqual([input.id]);
    const at = new Date('2026-11-19T13:00:00.000Z');
    expect(await markAttentionHandled(collection, input.id, () => at)).toBe(true);
    const row = await stored(input.id);
    expect(row.attentionHandledFor).toBe(input.commandId);
    expect(row.updatedAt).toBe(at.toISOString());
    expect(await attention()).toEqual([]);
  });
  it('H2 refuses a pending order and changes nothing', async () => {
    const input = order({ localWarnings: [{ code: 'customer_omitted', field: 'email' }] });
    await collection.insert(input);
    const before = await stored(input.id);
    expect(await markAttentionHandled(collection, input.id, () => new Date('2026-11-19T13:00:00.000Z'))).toBe(false);
    expect(await stored(input.id)).toEqual(before);
  });
  it('H3 resolves false for an unknown id', async () => {
    expect(await markAttentionHandled(collection, uuidv7())).toBe(false);
  });
  it('H4 stamps an applied order with a known warning, and it leaves needsAttention', async () => {
    const input = order({ syncStatus: 'applied', warnings: [{ code: 'insufficient_stock', variantId: 'blue', quantity: 1 }] });
    await collection.insert(input);
    expect((await attention()).map(({ id }) => id)).toEqual([input.id]);
    expect(await markAttentionHandled(collection, input.id)).toBe(true);
    expect((await stored(input.id)).attentionHandledFor).toBe(input.commandId);
    expect(await attention()).toEqual([]);
  });
  it('H5 a second stamp resolves true and leaves updatedAt at the first stamp', async () => {
    const input = order({ syncStatus: 'rejected', error: { code: 'payment_declined', message: 'Refused' } });
    await collection.insert(input);
    const first = new Date('2026-11-19T13:00:00.000Z'), second = new Date('2026-11-19T14:00:00.000Z');
    expect(await markAttentionHandled(collection, input.id, () => first)).toBe(true);
    expect(await markAttentionHandled(collection, input.id, () => second)).toBe(true);
    expect(await stored(input.id)).toMatchObject({ attentionHandledFor: input.commandId, updatedAt: first.toISOString() });
  });
});
