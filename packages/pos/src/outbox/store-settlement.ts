import type { SettleCancelRequest, SettleOutcome } from '@tallyui/core';
import type { RxCollection } from 'rxdb';
import { outboxLogger } from './logger';
import { canCancelOnStore, storeOrderLeft, uuidv7, type PosOrder, type PosOrderStoreSettlement } from '../pos-order';

export interface CancelOnStoreDeps {
  orders: RxCollection<PosOrder>;
  /** The connector's cancel, bound to the open store (`RefusedOrderSettlement.cancel`). */
  cancel(request: SettleCancelRequest): Promise<SettleOutcome>;
  now?: () => Date;
}

/**
 * Cancels on the store the order a refused sale left behind (#1101), when `canCancelOnStore` allows it on the stored
 * row; otherwise resolves to `not_offered` and never calls `cancel`. It first stores the attempt as `sending` (keeping
 * the stored `attemptId` of a cancel still `sending`, so a repeat is the same attempt), and only once that write has
 * resolved calls `cancel`. The outcome is written only while the stored settlement is still this attempt's `sending`
 * one; `retry` writes nothing, and a rejected `cancel` leaves the row `sending` and rejects with the same error.
 * `syncStatus`, `error`, `commandId`, `payments` and the totals are never changed. pos_orders is till-local, never
 * pulled from a store, so these writes break no replication rule.
 */
export async function cancelOnStore(deps: CancelOnStoreDeps, orderId: string): Promise<SettleOutcome | { kind: 'not_offered' }> {
  const stamp = () => (deps.now?.() ?? new Date()).toISOString();
  let request: SettleCancelRequest | undefined;
  await (await deps.orders.findOne(orderId).exec())?.incrementalModify((data) => {
    // The modifier runs again on a write conflict, so it decides on the stored state each run.
    request = undefined;
    if (data._deleted || !canCancelOnStore(data)) return data;
    const stored = data.storeSettlement;
    const attemptId = stored?.kind === 'cancel' && stored.state === 'sending' ? stored.attemptId : uuidv7();
    const at = stamp();
    data.storeSettlement = { kind: 'cancel', state: 'sending', attemptId, at };
    data.updatedAt = at;
    request = { storeOrderId: storeOrderLeft(data)!.orderId, clientOrderId: data.id, attemptId };
    return data;
  });
  if (!request) return { kind: 'not_offered' };
  const sent: SettleCancelRequest = request;
  const outcome = await deps.cancel(sent);
  if (outcome.kind === 'retry') {
    outboxLogger.info('Cancelling the store order got no definite answer; it stays sending', { orderId, reason: outcome.reason });
    return outcome;
  }
  if (outcome.kind === 'refused') outboxLogger.warn('The store refused to cancel the order', { orderId, code: outcome.code, message: outcome.message });
  if (outcome.kind === 'changed') {
    outboxLogger.warn('The store order changed; nothing was cancelled', { orderId, status: outcome.status, capturedMinor: outcome.capturedMinor });
  }
  await (await deps.orders.findOne(orderId).exec())?.incrementalModify((data) => {
    const stored = data.storeSettlement;
    // A newer attempt, or an answer already written, wins over this one.
    if (stored?.attemptId !== sent.attemptId || stored.state !== 'sending') return data;
    const at = stamp();
    const base = { kind: 'cancel' as const, attemptId: sent.attemptId, at };
    const settled: PosOrderStoreSettlement = outcome.kind === 'done' ? { ...base, state: 'done', storeStatus: outcome.status }
      : outcome.kind === 'changed' ? { ...base, state: 'changed', storeStatus: outcome.status, capturedMinor: outcome.capturedMinor }
        : outcome.kind === 'refused' ? { ...base, state: 'refused', code: outcome.code, message: outcome.message }
          : { ...base, state: 'gone' };
    data.storeSettlement = settled;
    data.updatedAt = at;
    return data;
  });
  return outcome;
}
