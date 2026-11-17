// @vitest-environment node
import { expect, it } from 'vitest';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { StoreOrder } from '@tallyui/core';
import { reopenPayloadErrors, updatePayloadErrors } from '@tallyui/core/server';
import { orderBuilderFromStoreOrder, StoreOrderRebuildError } from '../order/from-store-order';
import { createOrderBuilder } from '../order/order-builder';
import { REVISION_MAX, toOrderUpdateEnvelope } from '../pos-order/command';
import { finalizeOrder } from '../pos-order/finalize';
import { addPosOrderCollection } from '../pos-order/open';
import { uuidv7 } from '../pos-order/uuidv7';

const REV_A = 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298';
const taxContext = { getTaxRatePpm: () => 100000, pricesIncludeTax: false }, options = { currency: 'EUR', taxContext };
function storeOrder(): StoreOrder {
  return {
    id: '41', reference: '41', clientOrderId: 'u-1', revision: REV_A, status: 'completed',
    placedAt: '2026-11-17T10:00:00.000Z', currency: 'EUR', pricesIncludeTax: false,
    customer: { id: '5', name: 'Jane', email: 'jane@example.test' },
    lines: [
      { id: '7', productId: 'coffee', name: 'Coffee', quantity: 2,
        subtotalMinor: 2000, totalMinor: 2000, subtotalTaxMinor: 200, taxMinor: 200 },
      { id: '8', productId: 'coffee', name: 'Coffee', quantity: 1,
        subtotalMinor: 1000, totalMinor: 1000, subtotalTaxMinor: 100, taxMinor: 100 },
      { id: '9', productId: 'tea', name: 'Tea', quantity: 1,
        subtotalMinor: 600, totalMinor: 600, subtotalTaxMinor: 60, taxMinor: 60 },
    ],
    fees: [{ id: 'f1', name: 'Handling', totalMinor: 500, taxMinor: 50, taxStatus: 'taxable' }],
    shipping: [{ id: 's1', name: 'Delivery', totalMinor: 800, taxMinor: 80, taxStatus: 'taxable', methodId: 'flat_rate' }],
    coupons: [], refunds: [], discountMinor: 0, discountTaxMinor: 0, taxLines: [],
    taxMinor: 490, totalMinor: 5390,
    payments: [{ id: 'p1', method: 'pos_cash', title: 'Cash', amountMinor: 1000 }],
  };
}

it('a store revision of 71 and 128 characters passes every shape and 129 fails every one (ADR-090)', async () => {
  expect(REV_A.length).toBe(71); expect(REVISION_MAX).toBe(128);
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 0 } });
  builder.addLine({ productId: 'p1', name: 'Kept item', unitPrice: { amount: 100, currency: 'EUR' } });
  builder.addPayment({ method: 'cash', amountMinor: 100 });
  const sale = finalizeOrder(builder.getSnapshot(), { now: new Date('2026-11-17T10:00:00.000Z'), capabilities: { orderCreate: 9 } });
  const row = { ...sale, storeOrderId: '4711', baseRevision: REV_A, lines: [{ ...sale.lines[0], storeLineId: '11' }] }, read = storeOrder();
  const reopen = { orderId: '41', cashierRef: '7', registerId: 'register-1', createdAt: '2026-11-17T10:00:00.000Z' };
  const db = await createRxDatabase({ name: `revision${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  try {
    const orders = await addPosOrderCollection(db);
    for (const revision of [REV_A, 'r'.repeat(128)]) {
      expect(reopenPayloadErrors({ ...reopen, baseRevision: revision })).toEqual([]);
      expect(updatePayloadErrors(JSON.parse(JSON.stringify(toOrderUpdateEnvelope({ ...row, baseRevision: revision }, 'device-1').payload)))).toEqual([]);
      expect(() => orderBuilderFromStoreOrder({ ...read, revision }, options)).not.toThrow();
      await orders.insert({ ...row, id: uuidv7(), baseRevision: revision });
    }
    const revision = 'r'.repeat(129), message = 'baseRevision: expected a non-empty string of at most 128 characters';
    expect(reopenPayloadErrors({ ...reopen, baseRevision: revision })).toEqual([message]);
    expect(updatePayloadErrors(JSON.parse(JSON.stringify(toOrderUpdateEnvelope({ ...row, baseRevision: revision }, 'device-1').payload)))).toContain(message);
    expect(() => orderBuilderFromStoreOrder({ ...read, revision }, options)).toThrow(StoreOrderRebuildError);
    expect(() => orderBuilderFromStoreOrder({ ...read, revision }, options)).toThrow(expect.objectContaining({ reason: 'revision' }));
    await expect(orders.insert({ ...row, id: uuidv7(), baseRevision: revision })).rejects.toMatchObject({ code: 'VD2' });
  } finally { await db.remove(); }
});
