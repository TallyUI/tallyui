// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createRxDatabase, type RxCollection } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { OrderCreateEnvelope, OrderUpdateEnvelope } from '@tallyui/core';
import { createOrderBuilder } from '../order/order-builder';
import { finalizeOrder, needsAttention, posOrderCollection, uuidv7, type PosOrder } from '../pos-order';
import { deriveExpected, paymentLedgerRows } from '../register/expected';
import { createOrderOutbox, isRequeueableOrder, type OrderOutbox } from './order-outbox';
import type { CommandTransport } from './types';

it('X12 keeps every payment and counts the refused exempt sale in attention and drawer cash', async () => {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 0 } });
  builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 300, currency: 'EUR' } });
  builder.addPayment({ method: 'cash', amountMinor: 100 });
  builder.addPayment({ method: 'cash', amountMinor: 200 });
  const order = { ...finalizeOrder({ ...builder.getSnapshot(), taxExempt: true }, { capabilities: { orderCreate: 12, taxExempt: true } }), sessionId: 's1' };
  const send = vi.fn<CommandTransport<OrderCreateEnvelope | OrderUpdateEnvelope>['send']>(async batch => ({ kind: 'results', results: batch.map(({ id }) => ({
    id, status: 'rejected', error: { code: 'invalid_payload', message: "This store's WooCommerce connector does not carry tax exemption yet; complete the sale without it.",
      data: { storeCode: 'tax_exempt_unsupported' } },
  })) }));
  const db = await createRxDatabase<{ pos_orders: RxCollection<PosOrder> }>({ name: `outbox${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  let outbox: OrderOutbox | undefined;
  try {
    const { pos_orders: collection } = await db.addCollections({ pos_orders: posOrderCollection() });
    await collection.insert(order);
    outbox = createOrderOutbox({ collection, transport: { send }, deviceId: 'till' });
    await outbox.flush();
    expect(send.mock.calls[0][0]).toMatchObject([{ id: order.commandId, payload: { taxExempt: true } }]);
    const stored = (await collection.findOne(order.id).exec())!.toJSON() as PosOrder;
    expect(stored).toMatchObject({ taxExempt: true, syncStatus: 'rejected', error: { code: 'invalid_payload' } });
    expect(stored.payments).toStrictEqual(order.payments);
    expect(needsAttention([stored])).toEqual([stored]);
    expect(isRequeueableOrder(stored)).toBe(true);
    expect(deriveExpected({ session: { id: 's1', countedFloatMinor: 5000 }, movements: [], ledgerRowsBySession: paymentLedgerRows([stored]) }).cash).toBe(5300);
  } finally { outbox?.stop(); await db.remove(); }
});
