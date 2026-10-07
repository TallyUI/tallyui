// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { posRefundCollection, posRefundSchema, type PosRefund, type PosRefundCollection } from './pos-refund';

const record: PosRefund = {
  id: '019d0e2e-0000-7000-8000-000000000002', commandId: '019d0e2e-0000-7000-8000-000000000001',
  orderId: 'order-1', sessionId: 'session-1', registerId: 'register-1',
  envelope: {
    id: '019d0e2e-0000-7000-8000-000000000001', type: 'order.refund', version: 1,
    createdAt: '2026-10-07T10:00:00.000Z', deviceId: 'till-1', attempt: 1,
    payload: {
      clientRefundId: '019d0e2e-0000-7000-8000-000000000002', orderId: 'order-1',
      lines: [{ orderLineId: 'line-1', quantity: 1, restock: true }],
      shippingMinor: 0, adjustmentMinor: 0, totalMinor: 1000,
      destination: 'cash', reason: 'Returned item', registerId: 'register-1', sessionId: 'session-1',
      createdAt: '2026-10-07T10:00:00.000Z',
    },
  },
  status: 'applied', duplicate: false,
  result: {
    totalMinor: 1000, byMethod: { cash: 1000 },
    refunds: [{ id: 'refund-1', paymentId: 'payment-1', totalMinor: 1000, state: 'Settled' }],
  },
  createdAt: '2026-10-07T10:00:00.000Z', updatedAt: '2026-10-07T10:00:01.000Z',
};
let db: RxDatabase<{ pos_refunds: PosRefundCollection }>;
beforeEach(async () => {
  db = await createRxDatabase({
    name: `refundschema${Math.random().toString(36).slice(2)}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false,
  });
  await db.addCollections({ pos_refunds: posRefundCollection() });
});
afterEach(async () => { await db.remove(); });

describe('posRefundSchema', () => {
  it('has version 0, the refund primary key, session index and exact required fields', () => {
    expect(posRefundSchema.version).toBe(0);
    expect(posRefundSchema.primaryKey).toBe('id');
    expect(posRefundSchema.indexes).toStrictEqual([['sessionId']]);
    expect(posRefundSchema.required).toStrictEqual([
      'id', 'commandId', 'orderId', 'sessionId', 'registerId', 'envelope', 'status', 'createdAt', 'updatedAt',
    ]);
    expect(posRefundSchema.additionalProperties).toBe(false);
    expect(posRefundSchema.properties.error).toMatchObject({
      additionalProperties: false, required: ['code', 'message'],
    });
  });

  it('round-trips a full applied record through validated storage', async () => {
    await db.pos_refunds.insert(record);
    expect((await db.pos_refunds.findOne(record.id).exec())!.toJSON()).toStrictEqual(record);
  });

  it('refuses an unknown status', async () => {
    await expect(db.pos_refunds.insert({ ...record, status: 'done' as PosRefund['status'] })).rejects.toThrow();
  });

  it('refuses an unknown top-level field', async () => {
    const extra = { ...record, unexpected: true };
    await expect(db.pos_refunds.insert(extra)).rejects.toThrow();
  });
});
