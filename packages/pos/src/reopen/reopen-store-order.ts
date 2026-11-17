import type { OrderReopenEnvelope, StoreOrder, StoreOrderLine } from '@tallyui/core';
import type { CustomerSummary, Order } from '../order/types';
import { storeOrderCustomer } from '../order/from-store-order';
import type { CommandTransport } from '../outbox/types';
import { uuidv7 } from '../pos-order/uuidv7';
import type { TaxContext } from '../tax/types';
import { ReopenEntryError, storeOrderForReopen, type ReopenEntryReason } from './reopen-entry';
import { sendOrderReopen, type OrderReopenOutcome } from './send-order-reopen';

export const REOPENED_NOT_LOADED = 'The store has reopened this order, but the till could not load it. Check the order in the store before trying again.';
export const STORE_ORDER_OPEN_HERE = 'This order is already open on this till. Find it in the current sale or the parked sales.';

export type ReopenStoreOrderOutcome =
  /** The store reopened the order and the till rebuilt it from the read taken after the reopen. */
  | { kind: 'reopened'; order: Order; duplicate: boolean }
  /** The pre-check refused the detail read; nothing was sent. */
  | { kind: 'refused'; reason: ReopenEntryReason | 'open_here'; message: string }
  /** The store did not reopen the order, or its answer is unknown (sendOrderReopen's outcome, unchanged).
   * When outcome.kind is 'unknown', pass envelope back as deps.resend to retry. After any other outcome, a new attempt starts without it. */
  | { kind: 'not_reopened'; outcome: Exclude<OrderReopenOutcome, { kind: 'applied' }>; envelope: OrderReopenEnvelope }
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
  /** The sale's per-customer tax context; pass the same function as useSale's `taxContextFor` option. */
  taxContextFor?: (customer: CustomerSummary | null) => { taxContext: TaxContext };
  /** Whether this till's live sale or a parked sale already holds the store order (useSale's holdsStoreOrder). */
  openHere: (orderId: string) => boolean | Promise<boolean>;
  resend?: OrderReopenEnvelope;
  catalogue: (line: StoreOrderLine) => { taxClass?: string; taxStatus?: 'taxable' | 'none' } | null;
  /** Milliseconds since the epoch; defaults to Date.now. */
  now?: () => number;
}): Promise<ReopenStoreOrderOutcome> {
  const options = { currency: deps.currency, taxContext: deps.taxContext, catalogue: deps.catalogue };
  try {
    storeOrderForReopen(read, { ...options, taxContext: deps.taxContextFor ? deps.taxContextFor(storeOrderCustomer(read)).taxContext : deps.taxContext });
  } catch (error) {
    if (error instanceof ReopenEntryError) return { kind: 'refused', reason: error.reason, message: error.message };
    throw error;
  }
  if (await deps.openHere(read.id)) return { kind: 'refused', reason: 'open_here', message: STORE_ORDER_OPEN_HERE };
  if (deps.resend && deps.resend.payload.orderId !== read.id) throw new Error('reopenStoreOrder: resend is for another order');
  const at = deps.resend ? 0 : (deps.now ?? Date.now)(), createdAt = new Date(at).toISOString();
  const { cashierRef, registerId, storeId, deviceId } = deps.identity;
  const envelope: OrderReopenEnvelope = deps.resend ? { ...deps.resend, attempt: deps.resend.attempt + 1 } : {
    id: uuidv7(at), type: 'order.reopen', version: 1, createdAt, deviceId, attempt: 1,
    payload: {
      orderId: read.id, ...(read.clientOrderId !== undefined ? { clientOrderId: read.clientOrderId } : {}),
      baseRevision: read.revision, cashierRef, registerId, ...(storeId !== undefined ? { storeId } : {}), createdAt,
    },
  };
  const outcome = await sendOrderReopen(deps.transport, envelope);
  if (outcome.kind !== 'applied') return { kind: 'not_reopened', outcome, envelope };
  let reread: StoreOrder | undefined;
  try {
    reread = (await deps.getOrders([read.id])).find((order) => order.id === read.id);
  } catch {
    return { kind: 'reopened_unloadable', reason: 'reread', message: `${REOPENED_NOT_LOADED} The order could not be read again.` };
  }
  if (!reread) return { kind: 'reopened_unloadable', reason: 'reread', message: `${REOPENED_NOT_LOADED} The order could not be read again.` };
  if (outcome.reopen.revision !== undefined && reread.revision !== outcome.reopen.revision)
    return { kind: 'reopened_unloadable', reason: 'reread', message: `${REOPENED_NOT_LOADED} The order read back does not match the reopen.` };
  try {
    const builder = storeOrderForReopen(reread, { ...options, taxContext: deps.taxContextFor ? deps.taxContextFor(storeOrderCustomer(reread)).taxContext : deps.taxContext });
    return { kind: 'reopened', order: builder.getSnapshot(), duplicate: outcome.duplicate };
  } catch (error) {
    if (error instanceof ReopenEntryError) return { kind: 'reopened_unloadable', reason: error.reason, message: `${REOPENED_NOT_LOADED} ${error.message}` };
    throw error;
  }
}
