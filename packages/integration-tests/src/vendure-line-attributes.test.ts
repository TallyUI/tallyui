// @vitest-environment node
import { expect, it } from 'vitest';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { createVendureConnector } from '@tallyui/connector-vendure';
import { addEntryToCart, catalogueEntries, createOrderBuilder, finalizeOrder, posOrderCollection } from '@tallyui/pos';
import type { PosOrder } from '@tallyui/pos';

// #1005 item 3: a Vendure variant's options reach the stored pos_orders line as `attributes`.
// The product is V1's (connectors/vendure product-traits.test.ts): Jeans, Size 30/32, Colour Blue.
const product = {
  id: '1', name: 'Jeans',
  optionGroups: [
    { id: '10', code: 'size', name: 'Size', options: [{ id: '100', code: 'size-30', name: '30' }, { id: '101', code: 'size-32', name: '32' }] },
    { id: '20', code: 'colour', name: 'Colour', options: [{ id: '200', code: 'blue', name: 'Blue' }] },
  ],
  variants: [
    { id: '1', name: 'Jeans 32 Blue', price: 5000, currencyCode: 'EUR', options: [
      { id: '101', code: 'size-32', name: '32', groupId: '10' }, { id: '200', code: 'blue', name: 'Blue', groupId: '20' },
    ] },
    { id: '2', name: 'Jeans 30 Blue', price: 5000, currencyCode: 'EUR', options: [
      { id: '100', code: 'size-30', name: '30', groupId: '10' }, { id: '200', code: 'blue', name: 'Blue', groupId: '20' },
    ] },
  ],
};

it('I1: the "32 Blue" variant\'s options are stored on its pos_orders line as attributes', async () => {
  const traits = createVendureConnector().traits.product;
  const entry = catalogueEntries([product], traits).find((e) => e.variant.id === '1')!;
  // Builder, finalize and pos_orders store copied from woo-charge-net-exclusive.test.ts.
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 0 } });
  addEntryToCart(builder, entry, traits, 'EUR');
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  const order = finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 9 } });
  const db = await createRxDatabase({ name: `vendureattrs${Math.random().toString(36).slice(2)}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  try {
    const { pos_orders: collection } = await db.addCollections({ pos_orders: posOrderCollection() });
    await collection.insert(order);
    const stored = (await collection.findOne(order.id).exec())!.toJSON() as PosOrder;
    expect(stored.lines).toHaveLength(1);
    expect(stored.lines[0].attributes).toEqual({ Size: '32', Colour: 'Blue' });
  } finally {
    await db.remove();
  }
});
