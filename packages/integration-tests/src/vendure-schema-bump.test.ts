// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import type { TallyConnector } from '@tallyui/core';
import { createVendureConnector, vendureProductSchema } from '@tallyui/connector-vendure';
import { addRegisterSessionCollection, ensureRegister, posOrderCollection, type PosOrder } from '@tallyui/pos';
import { createTallyDatabase, type TallyDatabase } from '@tallyui/database';

const stamp = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();

/** The v2 products schema: version 2, without v3's optionGroups and variant options[].groupId. */
type SchemaNode = { version: number; properties: Record<string, SchemaNode>; items: SchemaNode };
function versionTwoSchema(): typeof vendureProductSchema {
  const schema = structuredClone(vendureProductSchema) as unknown as SchemaNode;
  schema.version = 2;
  delete schema.properties.optionGroups;
  delete schema.properties.variants.items.properties.options.items.properties.groupId;
  return schema as unknown as typeof vendureProductSchema;
}

const order: PosOrder = {
  id: 'order-1', commandId: 'command-1', createdAt: stamp(1), updatedAt: stamp(1), currency: 'EUR', pricesIncludeTax: false,
  subtotalMinor: 1000, discountMinor: 0, taxMinor: 0, totalMinor: 1000, syncStatus: 'pending', customer: null,
  lines: [{ id: 'line-1', productId: '1', name: 'Jeans', sku: '', quantity: 1, unitPriceMinor: 1000, discountMinor: 0, netMinor: 1000, taxLines: [] }],
  payments: [{ id: 'payment-1', method: 'cash', amountMinor: 1000 }],
  taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' },
};
const session = { id: 'session-1', register_id: 'register-1', status: 'open', opened_at_gmt: stamp(1), counted_float_minor: 5000 };

let db: TallyDatabase | undefined;
afterEach(async () => {
  await db?.close();
  db = undefined;
});

/** Opens `name` with `schema` as Vendure's products schema, plus pos_orders and register_sessions as `@tallyui/pos` adds them. */
async function open(name: string, storage: unknown, schema: typeof vendureProductSchema) {
  const connector: TallyConnector = { ...createVendureConnector(), schemas: { products: schema } };
  db = await createTallyDatabase({ connector, name, storage });
  await db.addCollections({ pos_orders: posOrderCollection() });
  await addRegisterSessionCollection(db);
  return db;
}

describe('the Vendure products schema bump v2 → v3 drops server data only (vendurepos gap 2.5)', () => {
  it('empties products; the open order, the session, the register document and stock_levels survive', async () => {
    const storage = getRxStorageMemory();
    const name = `vendureschemabump${Date.now()}`;

    const before = await open(name, storage, versionTwoSchema());
    expect(before.products.schema.version).toBe(2);
    await before.products.insert({ id: '1', name: 'Jeans', variants: [{ id: '1', price: 1000, options: [{ id: '100', name: '30', code: 'size-30' }] }] });
    // The catalogue reconcile's gate (#248), the only local document on products.
    await before.products.upsertLocal('catalogue-reconcile', { lastCompletedAt: 1 });
    await before.pos_orders.insert(order);
    await before.register_sessions.insert(session);
    await ensureRegister(before.register_sessions, 'web');
    // Vendure has reconcile.stock, so createTallyDatabase adds the stock_levels overlay.
    await before.stock_levels.insert({ id: '1', value: { status: 'in_stock', quantity: 3 }, updatedAt: stamp(1) });
    const orderRow = (await before.pos_orders.findOne('order-1').exec())!.toJSON(true);
    const sessionRow = (await before.register_sessions.findOne('session-1').exec())!.toJSON(true);
    const registerDoc = (await before.register_sessions.getLocal('register'))!.toJSON(true);
    const stockRow = (await before.stock_levels.findOne('1').exec())!.toJSON(true);
    await before.close();

    const after = await open(name, storage, vendureProductSchema);
    expect(after.products.schema.version).toBe(3);
    expect(await after.products.count().exec()).toBe(0);
    // The reconcile gate is server-derived (the next pass rebuilds it); the drop leaves it in place.
    expect((await after.products.getLocal('catalogue-reconcile'))?.toJSON(true).data).toEqual({ lastCompletedAt: 1 });

    expect((await after.pos_orders.findOne('order-1').exec())!.toJSON(true)).toEqual(orderRow);
    expect((await after.register_sessions.findOne('session-1').exec())!.toJSON(true)).toEqual(sessionRow);
    expect((await after.register_sessions.getLocal('register'))!.toJSON(true)).toEqual(registerDoc);
    expect((await after.stock_levels.findOne('1').exec())!.toJSON(true)).toEqual(stockRow);
  }, 30000);
});
