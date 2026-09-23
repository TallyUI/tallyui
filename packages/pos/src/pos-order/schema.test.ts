// @vitest-environment node
import { expect, it } from 'vitest';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { createOrderBuilder } from '../order/order-builder';
import { finalizeOrder } from './finalize';
import { posOrderSchema } from './schema';
import { uuidv7 } from './uuidv7';

it('inserts a finalised order into an AJV-validated RxDB memory collection', async () => {
  const db = await createRxDatabase({ name: `posorder${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  try {
    const { pos_orders } = await db.addCollections({ pos_orders: { schema: posOrderSchema } });
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRate: () => 0.19, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p1', variantId: 'v1', name: 'Item 1', unitPrice: { amount: 850, currency: 'EUR' }, quantity: 2,
      taxRates: [{ code: 'VAT', ratePpm: 190000 }] });
    builder.addLine({ productId: 'p2', name: 'Item 2', unitPrice: { amount: 1200, currency: 'EUR' } });
    builder.addPayment({ method: 'external', amountMinor: 1000, reference: 'terminal' });
    builder.addPayment({ method: 'cash', amountMinor: 3000 });
    builder.setCustomer({ id: 'c1', name: 'Customer', email: 'buyer@example.com' });
    builder.setNote('Sale note');
    const order = finalizeOrder(builder.getSnapshot(), { registerId: 'r1', cashierRef: 'staff1' });
    const doc = await pos_orders.insert(order);
    expect(doc.toJSON()).toStrictEqual(order);
    await pos_orders.insert({ ...order, id: uuidv7(), syncStatus: 'applied', customer: null,
      serverRefs: { orderId: 'server1', displayId: '301', totalMinor: 3451 },
      warnings: [{ code: 'total_mismatch', expectedMinor: 3451, serverMinor: 3452 }, { code: 'insufficient_stock', variantId: 'v1', quantity: 2 }],
    });
    await pos_orders.insert({ ...order, id: uuidv7(), syncStatus: 'rejected', error: { code: 'invalid', message: 'Rejected' } });
    await expect(pos_orders.insert({ ...order, id: uuidv7(), syncStatus: 'invalid' })).rejects.toThrow();
    await expect(pos_orders.insert({ ...order, id: uuidv7(), extra: true })).rejects.toThrow();
    expect(posOrderSchema.indexes).toEqual(['createdAt', 'syncStatus', ['syncStatus', 'createdAt']]);
  } finally {
    await db.remove();
  }
});
