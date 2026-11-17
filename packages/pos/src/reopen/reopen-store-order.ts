import type { OrderReopenEnvelope, StoreOrder, StoreOrderLine } from '@tallyui/core';
import type { Order } from '../order/types';
import type { CommandTransport } from '../outbox/types';
import { uuidv7 } from '../pos-order/uuidv7';
import type { TaxContext } from '../tax/types';
import { ReopenEntryError, storeOrderForReopen, type ReopenEntryReason } from './reopen-entry';
import { sendOrderReopen, type OrderReopenOutcome } from './send-order-reopen';

export const REOPENED_NOT_LOADED = 'The store has reopened this order, but the till could not load it. Check the order in the store before trying again.';

export type ReopenStoreOrderOutcome =
  /** The store reopened the order and the till rebuilt it from the read taken after the reopen. */
  | { kind: 'reopened'; order: Order; duplicate: boolean }
  /** The pre-check refused the detail read; nothing was sent. */
  | { kind: 'refused'; reason: ReopenEntryReason; message: string }
  /** The store did not reopen the order, or its answer is unknown (sendOrderReopen's outcome, unchanged). */
  | { kind: 'not_reopened'; outcome: Exclude<OrderReopenOutcome, { kind: 'applied' }> }
  /** The store reopened it, but the read after it failed or was refused. `message` starts with REOPENED_NOT_LOADED. */
  | { kind: 'reopened_unloadable'; reason: ReopenEntryReason | 'reread'; message: string };

/** Reopens from the detail read the cashier opened, not a list row (ADR-090 decision 1).
 * `baseRevision` is that read's revision; the cart is built from the read after reopening. */
export async function reopenStoreOrder(read: StoreOrder, deps: {
  transport: CommandTransport<OrderReopenEnvelope>;
  /** The connector's getOrders, bound to the sync context. */
  getOrders: (ids: readonly string[]) => Promise<StoreOrder[]>;
  identity: { cashierRef: string; registerId: string; storeId?: string; deviceId: string };
  currency: string;
  taxContext: TaxContext;
  catalogue: (line: StoreOrderLine) => { taxClass?: string; taxStatus?: 'taxable' | 'none' } | null;
  /** Milliseconds since the epoch; defaults to Date.now. */
  now?: () => number;
}): Promise<ReopenStoreOrderOutcome> {
  const options = { currency: deps.currency, taxContext: deps.taxContext, catalogue: deps.catalogue };
  try {
    storeOrderForReopen(read, options);
  } catch (error) {
    if (error instanceof ReopenEntryError) return { kind: 'refused', reason: error.reason, message: error.message };
    throw error;
  }
  const at = (deps.now ?? Date.now)(), createdAt = new Date(at).toISOString();
  const { cashierRef, registerId, storeId, deviceId } = deps.identity;
  const envelope: OrderReopenEnvelope = {
    id: uuidv7(at), type: 'order.reopen', version: 1, createdAt, deviceId, attempt: 1,
    payload: {
      orderId: read.id, ...(read.clientOrderId !== undefined ? { clientOrderId: read.clientOrderId } : {}),
      baseRevision: read.revision, cashierRef, registerId, ...(storeId !== undefined ? { storeId } : {}), createdAt,
    },
  };
  const outcome = await sendOrderReopen(deps.transport, envelope);
  if (outcome.kind !== 'applied') return { kind: 'not_reopened', outcome };
  let reread: StoreOrder | undefined;
  try {
    reread = (await deps.getOrders([read.id])).find((order) => order.id === read.id);
  } catch {
    return { kind: 'reopened_unloadable', reason: 'reread', message: `${REOPENED_NOT_LOADED} The order could not be read again.` };
  }
  if (!reread) return { kind: 'reopened_unloadable', reason: 'reread', message: `${REOPENED_NOT_LOADED} The order could not be read again.` };
  try {
    const builder = storeOrderForReopen(reread, options);
    return { kind: 'reopened', order: builder.getSnapshot(), duplicate: outcome.duplicate };
  } catch (error) {
    if (error instanceof ReopenEntryError) return { kind: 'reopened_unloadable', reason: error.reason, message: `${REOPENED_NOT_LOADED} ${error.message}` };
    throw error;
  }
}
