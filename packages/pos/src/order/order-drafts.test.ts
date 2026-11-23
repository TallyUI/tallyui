// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { uuidv7 } from '../pos-order/uuidv7';
import { createOrderBuilder } from './order-builder';
import { orderDraftSchema, restoreOrderDraft, writeOrderDraft } from './order-drafts';
import type { TaxContext } from '../tax';
import type { Order } from './types';

// A parked sale keeps each leg's takenAt; a draft from before it restores without the key.
const taxContext: TaxContext = { pricesIncludeTax: false, getTaxRatePpm: () => 0 };
let db: RxDatabase<{ order_drafts: RxCollection }>;
beforeEach(async () => {
  db = await createRxDatabase({ name: `drafts${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  await db.addCollections({ order_drafts: { schema: orderDraftSchema } });
});
afterEach(async () => { await db.remove(); });

function sale(): Order {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext });
  builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 1000, currency: 'EUR' } });
  builder.addPayment({ method: 'external', amountMinor: 400, status: 'pending', takenAt: '2026-11-21T10:15:00.000Z' });
  builder.addPayment({ method: 'cash', amountMinor: 600 });
  return builder.getSnapshot();
}

async function parkAndResume(order: Order): Promise<Order> {
  const id = await writeOrderDraft(db.order_drafts, order);
  const saved = JSON.parse((await db.order_drafts.findOne(id).exec())!.data) as Order;
  return restoreOrderDraft(saved, { currency: 'EUR', taxContext }).getSnapshot();
}

describe('restoreOrderDraft payment takenAt', () => {
  it('T5 keeps takenAt through a park and resume', async () => {
    const restored = await parkAndResume(sale());
    expect(restored.payments[0]).toMatchObject({ takenAt: '2026-11-21T10:15:00.000Z', status: 'pending' });
  });

  it('T6 restores a legacy leg with no takenAt key', async () => {
    const restored = await parkAndResume(sale());
    expect(restored.payments[1]).not.toHaveProperty('takenAt');
  });

  it('drops a takenAt that is not an ISO instant, keeping the leg', async () => {
    const order = sale();
    const restored = await parkAndResume({ ...order, payments: order.payments.map((p, i) => i ? { ...p, takenAt: 'yesterday' } : p) });
    expect(restored.payments[0]).toMatchObject({ takenAt: '2026-11-21T10:15:00.000Z' });
    expect(restored.payments[1]).toMatchObject({ method: 'cash', amountMinor: 600 });
    expect(restored.payments[1]).not.toHaveProperty('takenAt');
  });

  it('F5 S3: drops a restored sessionId that is not a string, keeping the leg', async () => {
    const order = sale();
    const restored = await parkAndResume({ ...order, payments: order.payments.map((p, i) => ({ ...p, sessionId: (i ? 42 : 'session-a') as unknown as string })) });
    expect(restored.payments[0]).toMatchObject({ sessionId: 'session-a' });
    expect(restored.payments[1]).toMatchObject({ method: 'cash', amountMinor: 600 });
    expect(restored.payments[1]).not.toHaveProperty('sessionId');
  });
});
