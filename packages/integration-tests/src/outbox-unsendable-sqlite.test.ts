// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createRxDatabase } from 'rxdb';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { CommandResult, OrderCreateEnvelope, OrderUpdateEnvelope } from '@tallyui/core';
import { readFresh } from '@tallyui/core/rxdb';
import { addPosOrderCollection } from '@tallyui/pos/pos-order/open';
import { uuidv7 } from '@tallyui/pos/pos-order/uuidv7';
import type { PosOrder } from '@tallyui/pos/pos-order/types';
import { UPDATE_UNSENDABLE, UPDATE_UNSENDABLE_MESSAGE } from '@tallyui/pos/pos-order/needs-attention';
import { createOrderOutbox } from '@tallyui/pos/outbox/order-outbox';
import { loadSQLiteStorage, openNodeSQLite } from '@tallyui/storage-sqlite/node-sqlite.test-helper';
const getRxStorageSQLite = await loadSQLiteStorage();
if (!getRxStorageSQLite && process.env.CI) {
  it('requires rxdb-premium in CI', () => { throw new Error('rxdb-premium is missing in CI'); });
}
const epoch = Date.parse('2026-09-23T12:00:00.000Z');
function order(i: number): PosOrder {
  const createdAt = new Date(epoch + i * 1000).toISOString();
  return {
    id: uuidv7(), commandId: uuidv7(), createdAt, updatedAt: createdAt, currency: 'EUR', pricesIncludeTax: false,
    lines: [{ id: uuidv7(), productId: `product-${i}`, name: `Item ${i}`, sku: `SKU${i}`, quantity: 1,
      unitPriceMinor: 100 + i, discountMinor: 0, netMinor: 100 + i, taxLines: [] }],
    payments: [{ id: uuidv7(), method: 'cash', amountMinor: 100 + i }], customer: null,
    subtotalMinor: 100 + i, discountMinor: 0, taxMinor: 0, totalMinor: 100 + i, syncStatus: 'pending',
    taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' },
  };
}
function reopened(i: number): PosOrder {
  const input = order(i);
  return { ...input, storeOrderId: 'store-' + i, baseRevision: `sha256:${String(i).repeat(64)}`,
    taxByRate: [], display: { currency: 'EUR', exponent: 2, taxInclusive: false, subtotalMinor: 100 + i, discountMinor: 0,
      taxMinor: 0, totalMinor: 100 + i, orderDiscountMinor: 0, lines: [{ lineId: input.lines[0].id, amountMinor: 100 + i, discounts: [] }] },
    lines: [{ ...input.lines[0], storeLineId: '11' }], payments: [{ ...input.payments[0], storePaymentId: '21' }] };
}
function applied(batch: Array<OrderCreateEnvelope | OrderUpdateEnvelope>): CommandResult[] {
  return batch.map((command) => ({ id: command.id, status: 'applied',
    serverRefs: { orderId: `server-${command.id}`, totalMinor: command.payload.totalMinor } }));
}

(getRxStorageSQLite ? it : it.skip)('holds a skipped reopened sale and its later rows on SQLite, and sends the others', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'outbox-unsendable-'));
  try {
    const handle = openNodeSQLite(join(directory, 'orders.sqlite'));
    try {
      const db = await createRxDatabase({ name: 'outbox_unsendable', multiInstance: false,
        storage: wrappedValidateAjvStorage({ storage: getRxStorageSQLite!(handle.database) }) });
      try {
        const collection = await addPosOrderCollection(db), sent: Array<OrderCreateEnvelope | OrderUpdateEnvelope> = [];
        const outbox = createOrderOutbox({ collection, deviceId: 'device-1', transport: { send: async (batch) => {
          sent.push(...batch); return { kind: 'results', results: applied(batch) };
        } } });
        try {
          const a = reopened(1), b = reopened(2), c = reopened(3), d = reopened(4), e = order(5);
          b.storeOrderId = c.storeOrderId = a.storeOrderId; delete b.baseRevision;
          await collection.bulkInsert([a, b, c, d, e]); await outbox.flush(); await outbox.flush();
          expect(sent.map(({ id }) => id)).toEqual([a.commandId, d.commandId, e.commandId]);
          const rows = await readFresh(collection, { selector: {} });
          for (const row of [a, d, e]) expect(rows.find(({ id }) => id === row.id)?.syncStatus).toBe('applied');
          expect(rows.find(({ id }) => id === b.id)).toMatchObject({ syncStatus: 'pending',
            error: { code: UPDATE_UNSENDABLE, message: UPDATE_UNSENDABLE_MESSAGE } });
          const held = rows.find(({ id }) => id === c.id)!;
          expect(held.syncStatus).toBe('pending'); expect(held.error).toBeUndefined(); expect(held.sentVersion).toBeUndefined();
        } finally { outbox.stop(); }
      } finally { await db.close(); }
    } finally { handle.raw.close(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
