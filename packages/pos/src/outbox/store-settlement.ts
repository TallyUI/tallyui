import type { SettleCancelRequest, SettleOutcome, SettlePayment, SettlePayRequest, SettlePayResult } from '@tallyui/core';
import type { RxCollection } from 'rxdb';
import { outboxLogger } from './logger';
import { canCancelOnStore, canPayRestOnStore, storeOrderLeft, unrecordedLegs, uuidv7, type PosOrder, type PosOrderStoreSettlement } from '../pos-order';

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

export interface PayRestOnStoreDeps {
  orders: RxCollection<PosOrder>;
  /** The connector's pay, bound to the open store (`RefusedOrderSettlement.pay`). */
  pay(request: SettlePayRequest): Promise<SettlePayResult>;
  now?: () => Date;
}

type StoredPayment = NonNullable<PosOrderStoreSettlement['payments']>[number];

/**
 * Records on the store the legs of a refused sale its part-paid store order is missing (#1101 slice 3), when
 * `canPayRestOnStore` allows it on the stored row; otherwise resolves to `not_offered` and never calls `pay`. No money is
 * taken: each leg of `unrecordedLegs` is sent under a new id (method, amount, and `tenderedMinor` for cash only, never
 * the change), except that a stored pay with one payment per leg keeps its ids, amounts and `done` flags, so the store
 * skips a leg it already holds. It first stores the attempt as `sending` with those ids (a pay still `sending` also keeps
 * its `attemptId`, so a repeat is the same attempt; any other mints a new one), and only once that write has resolved
 * calls `pay`. The answer is written only while the stored settlement is still this attempt's `sending` one: every id in
 * `recorded` is marked `done` whatever the outcome, `retry` keeps `sending`, and a rejected `pay` leaves the row
 * `sending` and rejects with the same error.
 * `syncStatus`, `error`, `commandId`, `payments` and the totals are never changed.
 */
export async function payRestOnStore(deps: PayRestOnStoreDeps, orderId: string): Promise<SettleOutcome | { kind: 'not_offered' }> {
  const stamp = () => (deps.now?.() ?? new Date()).toISOString();
  let request: SettlePayRequest | undefined;
  await (await deps.orders.findOne(orderId).exec())?.incrementalModify((data) => {
    // The modifier runs again on a write conflict, so it decides on the stored state each run.
    request = undefined;
    if (data._deleted || !canPayRestOnStore(data)) return data;
    const stored = data.storeSettlement;
    const legs = unrecordedLegs(data);
    const again = stored?.kind === 'pay' && stored.payments?.length === legs.length ? stored : undefined;
    const attemptId = again?.state === 'sending' ? again.attemptId : uuidv7();
    const payments: StoredPayment[] = again?.payments ?? legs.map((leg) => ({
      id: uuidv7(), method: leg.method, amountMinor: leg.amountMinor,
      ...(leg.method === 'cash' && leg.tenderedMinor !== undefined ? { tenderedMinor: leg.tenderedMinor } : {}),
    }));
    const at = stamp();
    data.storeSettlement = { kind: 'pay', state: 'sending', attemptId, at, payments };
    data.updatedAt = at;
    request = { storeOrderId: storeOrderLeft(data)!.orderId, clientOrderId: data.id, attemptId, currency: data.currency,
      payments: payments.map(({ done: _done, ...payment }) => payment as SettlePayment) };
    return data;
  });
  if (!request) return { kind: 'not_offered' };
  const sent: SettlePayRequest = request;
  const { outcome, recorded } = await deps.pay(sent);
  if (outcome.kind === 'retry') {
    outboxLogger.info('Recording the rest on the store got no definite answer; it stays sending', { orderId, reason: outcome.reason, recorded: recorded.length });
  }
  if (outcome.kind === 'refused') outboxLogger.warn('The store refused to record the rest of the order', { orderId, code: outcome.code, message: outcome.message });
  if (outcome.kind === 'changed') {
    outboxLogger.warn('The store order changed; nothing more was recorded', { orderId, status: outcome.status, capturedMinor: outcome.capturedMinor });
  }
  const done = new Set(recorded);
  await (await deps.orders.findOne(orderId).exec())?.incrementalModify((data) => {
    const stored = data.storeSettlement;
    // A newer attempt, or an answer already written, wins over this one.
    if (stored?.attemptId !== sent.attemptId || stored.state !== 'sending') return data;
    const payments = (stored.payments ?? []).map((payment) => (done.has(payment.id) ? { ...payment, done: true } : payment));
    if (outcome.kind === 'retry' && payments.every((payment, index) => payment.done === stored.payments?.[index]?.done)) return data;
    const at = stamp();
    const base = { kind: 'pay' as const, attemptId: sent.attemptId, at, payments };
    data.storeSettlement = outcome.kind === 'retry' ? { ...stored, payments }
      : outcome.kind === 'done' ? { ...base, state: 'done', storeStatus: outcome.status }
        : outcome.kind === 'changed' ? { ...base, state: 'changed', storeStatus: outcome.status, capturedMinor: outcome.capturedMinor }
          : outcome.kind === 'refused' ? { ...base, state: 'refused', code: outcome.code, message: outcome.message }
            : { ...base, state: 'gone' };
    data.updatedAt = outcome.kind === 'retry' ? data.updatedAt : at;
    return data;
  });
  return outcome;
}
