// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { canCancelOnStore, canPayRestOnStore, canReverseOnStore, posOrderCollection, TILL_SESSION_CLOSED, uuidv7, type PosOrder } from '../pos-order';
import { deriveExpected, paymentLedgerRows } from '../register/expected';
import { cancelOnStore, reverseOnStore } from './store-settlement';
const session = { id: 's1', countedFloatMinor: 10000 }, cash = { id: 'cash', method: 'cash' as const, amountMinor: 1000 };
let db: RxDatabase<{ pos_orders: RxCollection<PosOrder> }>, orders: RxCollection<PosOrder>;
beforeEach(async () => {
  db = await createRxDatabase({ name: `settlesession${uuidv7().replaceAll('-', '')}`, storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  ({ pos_orders: orders } = await db.addCollections({ pos_orders: posOrderCollection() }));
});
afterEach(async () => { await db.remove(); });
const stored = async (id: string) => (await orders.findOne(id).exec())!.toJSON() as PosOrder;
const expectedOf = async (id: string) => deriveExpected({ session, movements: [], refunds: [], ledgerRowsBySession: paymentLedgerRows([await stored(id)]) });
it.each([
  ['R1', 'reverse', 'closed', 'done'], ['R2', 'cancel', 'closed', 'done'], ['R2b', 'cancel', 'closed', 'retry'],
  ['R3', 'reverse', 'replay', 'done'], ['R3b', 'cancel', 'replay', 'done'], ['R4', 'reverse', 'open', 'done'],
] as const)('%s: %s with session %s and answer %s', async (_name, kind, phase, result) => {
  const id = uuidv7(), at = new Date().toISOString(), replay = phase === 'replay', control = phase === 'open';
  let before: PosOrder['storeSettlement'] = { kind, state: 'sending', at, attemptId: uuidv7(), ...(kind === 'reverse' && { legs: [{ paymentId: cash.id, commandId: uuidv7() }] }) };
  await orders.insert({ id, sessionId: 's1', commandId: uuidv7(), createdAt: at, updatedAt: at, currency: 'EUR', pricesIncludeTax: false,
    lines: [{ id: 'line', productId: 'shirt', name: 'Shirt', sku: 'BLUE', quantity: 1, unitPriceMinor: 2000, discountMinor: 0, netMinor: 2000, taxLines: [] }],
    payments: [cash, { ...cash, id: 'rest' }], customer: null, totalMinor: 2000, subtotalMinor: 2000, discountMinor: 0, taxMinor: 0, syncStatus: 'rejected',
    error: { code: 'invalid_payload', message: 'part paid', data: { orderId: '115', displayId: '1001', ...(kind === 'reverse' && { recorded: 1 }) } },
    taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' }, ...(replay && { storeSettlement: before }) });
  let open: string | undefined = replay ? 's2' : 's1', frozenZ = await expectedOf(id);
  const outcome = result === 'done' ? { kind: result, status: 'cancelled' } : { kind: result, reason: 'network' };
  const cancel = vi.fn(async () => { if (!control) open = undefined; frozenZ = await expectedOf(id); before = (await stored(id)).storeSettlement; return outcome; });
  const reverse = vi.fn(async () => ({ outcome: await cancel(), voided: [cash.id] })), deps = { orders, openSessionId: () => open };
  const landed = kind === 'reverse' ? await reverseOnStore({ ...deps, reverse }, id) : await cancelOnStore({ ...deps, cancel }, id);
  expect(kind === 'reverse' ? reverse : cancel).toHaveBeenCalledTimes(replay ? 0 : 1);
  expect(landed).toEqual(control ? outcome : { kind: 'not_offered' }); expect(frozenZ).toEqual({ cash: 12000 });
  expect(await expectedOf(id)).toEqual(control ? { cash: 10000 } : frozenZ);
  const order = await stored(id), settlement = order.storeSettlement!;
  expect(settlement).toMatchObject({ kind, attemptId: before!.attemptId, ...(control ? { state: 'done' } : { state: 'refused', code: TILL_SESSION_CLOSED }) });
  expect(settlement.legs).toEqual(control ? [{ ...before!.legs![0], done: true }] : before!.legs);
  expect([canCancelOnStore(order), canReverseOnStore(order), canPayRestOnStore(order)]).toEqual([false, false, false]);
});
