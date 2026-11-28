// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createRxDatabase, type RxCollection } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { CommandResult, OrderCreateEnvelope } from '@tallyui/core';
import { createOrderBuilder } from '../order/order-builder';
import { finalizeOrder, needsAttention, posOrderCollection, taxExemptReasonDelivery, uuidv7, type PosOrder } from '../pos-order';
import { outboxLogger } from './logger';
import { createOrderOutbox, type OrderOutbox } from './order-outbox';
import type { CommandTransport } from './types';

const reason = { text: 'Charity, form ST-5 on file', certificateId: 'ST5-0042' };
type Send = CommandTransport<OrderCreateEnvelope>['send'];

async function flushSale(send: Send, email = 'ann@example.com') {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 88750 } });
  builder.addLine({ productId: 'p', name: 'Coffee', unitPrice: { amount: 1000, currency: 'EUR' } });
  builder.setTaxExempt(true);
  builder.setCustomer({ id: '42', name: 'Ann Lee', email });
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  const order = finalizeOrder({ ...builder.getSnapshot(), taxExemptReason: reason },
    { capabilities: { orderCreate: 13, taxExempt: true, taxExemptReason: 'optional' } });
  const db = await createRxDatabase<{ pos_orders: RxCollection<PosOrder> }>({ name: `outbox${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  let outbox: OrderOutbox | undefined;
  try {
    const { pos_orders: collection } = await db.addCollections({ pos_orders: posOrderCollection() });
    await collection.insert(order);
    outbox = createOrderOutbox({ collection, transport: { send }, deviceId: 'till', getMaxOrderCreateVersion: () => 13 });
    await outbox.flush();
    return (await collection.findOne(order.id).exec())!.toJSON() as PosOrder;
  } finally { outbox?.stop(); await db.remove(); }
}

it('O1 resends below 13 without the reason and keeps the reason locally as not sent', async () => {
  const send = vi.fn<Send>(async batch => ({ kind: 'results', results: batch.map((command): CommandResult => command.version > 12
    ? { id: command.id, status: 'rejected', error: { code: 'unsupported_version', message: 'Maximum 12', data: { orderCreate: 12 } } }
    : { id: command.id, status: 'applied', serverRefs: { orderId: 'server-1', totalMinor: command.payload.totalMinor } }) }));
  const stored = await flushSale(send);
  const sent = send.mock.calls.map(([batch]) => batch[0]);
  expect(sent).toHaveLength(2);
  expect(sent[0]).toMatchObject({ version: 13, payload: { taxExemptReason: reason } });
  expect(sent[1].version).toBeLessThanOrEqual(12);
  expect(sent[1].payload).not.toHaveProperty('taxExemptReason');
  expect(stored).toMatchObject({ syncStatus: 'applied', taxExemptReason: reason, sentVersion: sent[1].version, downgradedFrom: 13 });
  expect(taxExemptReasonDelivery(stored)).toBe('not_sent');
});

it.each(['invalid_payload', 'network down'] as const)('O2 keeps reason data out of state, attention and logs on %s', async failure => {
  const spies = (Object.keys(outboxLogger) as (keyof typeof outboxLogger)[]).map(method => vi.spyOn(outboxLogger, method));
  try {
    const send = vi.fn<Send>(async batch => {
      if (failure === 'network down') throw new Error('network down');
      return { kind: 'results', results: batch.map(({ id }) => ({ id, status: 'rejected',
        error: { code: 'invalid_payload', message: 'taxExempt requires taxExemptReason on this server' } })) };
    });
    const stored = await flushSale(send, 'a'.repeat(255));
    expect(send.mock.calls[0][0]).toMatchObject([{ version: 13, payload: { taxExemptReason: reason } }]);
    const { error, serverFailures, syncStatus, localWarnings } = stored;
    expect(syncStatus).toBe(failure === 'network down' ? 'pending' : 'rejected');
    const attention = needsAttention([stored]);
    expect(attention).toHaveLength(1);
    const row = attention[0];
    for (const fields of [{ error, serverFailures, syncStatus, localWarnings },
      { syncStatus: row.syncStatus, error: row.error, serverFailures: row.serverFailures }, ...spies.map(spy => spy.mock.calls)]) {
      expect(JSON.stringify(fields)).not.toContain('Charity');
      expect(JSON.stringify(fields)).not.toContain('ST5-0042');
    }
  } finally { for (const spy of spies) spy.mockRestore(); }
});
