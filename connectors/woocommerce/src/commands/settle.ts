import { ConnectorUnauthorizedError, type RefusedOrderSettlement, type SettleOutcome } from '@tallyui/core';
import { minor, paymentLedger } from '../orders';
import { createWooCall, type Answer } from './http';

type Row = Record<string, unknown>;
type Assessment = SettleOutcome | { kind: 'cancellable'; revision: string };

const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' && value.length > 0 ? value : undefined);
const blank = (value: unknown) => value === null || value === undefined || value === '';
const retry = (reason: string): SettleOutcome => ({ kind: 'retry', reason });
const refused = (code: string, message: string): SettleOutcome => ({ kind: 'refused', code, message });
const unreadable = () => refused('ledger_unreadable', "The store's payment record for this order could not be read.");

/** Ledger rows that hold no money; every other status (captured, authorized, pending, refunded, …) means money moved or may. */
const NO_MONEY = new Set(['failed', 'voided']);
/** At most this many cancel pushes per call: the first, and one resend after a conflict that still reads as cancellable. */
const MAX_CANCELS = 2;
const isConflict = (answer: Answer) => answer.status === 409 && isRow(answer.body) && answer.body.code === 'woo_rxdb_sync_conflict';

/** The store's current record, from a 409 conflict body: cancellable only when it shows nothing paid and is still waiting. */
function assess(body: Row, storeOrderId: string): Assessment {
  const current = body.current;
  const revision = text(body.currentRevision);
  if (!isRow(current) || !revision || !text(current.status) || !text(current.currency)) return retry('bad_body');
  const status = current.status as string;
  const currency = current.currency as string;
  if (String(current.id) !== storeOrderId) return refused('order_mismatch', 'The store answered with a different order.');
  const ledger = paymentLedger(current.meta_data);
  if (ledger.present && ledger.payments === null) return unreadable();
  const payments = ledger.payments ?? [];
  if (!payments.every((row) => isRow(row) && text(row.status))) return unreadable();
  const money = (payments as Row[]).filter((row) => !NO_MONEY.has(row.status as string));
  let capturedMinor = 0;
  for (const row of money) {
    if (row.status !== 'captured') continue;
    if (typeof row.currency === 'string' && row.currency !== currency) return unreadable();
    try {
      capturedMinor += minor(row.amount, currency);
    } catch {
      return unreadable();
    }
  }
  const unpaid = money.length === 0 && blank(current.date_paid) && blank(current.date_paid_gmt);
  if (unpaid && status === 'cancelled') return { kind: 'done', status: 'cancelled' };
  if (unpaid && (status === 'pending' || status === 'pos-open')) return { kind: 'cancellable', revision };
  return { kind: 'changed', status, capturedMinor };
}

/** Any answer other than a sync conflict (and other than a 200/201 cancel), to either push. */
function otherAnswer(answer: Answer, push: 'read' | 'cancel'): SettleOutcome {
  const { status } = answer;
  const body = isRow(answer.body) ? answer.body : {};
  const code = text(body.code);
  if (status === 401) throw new ConnectorUnauthorizedError(`WooCommerce order settle: HTTP ${status}`, 401);
  if (status === 0) return retry(answer.aborted ? 'timeout' : 'network');
  // Only the uuid resolver's 404 says the order is gone; a route 404 says nothing about it.
  if (status === 404) return code === 'woo_rxdb_sync_record_not_found' ? { kind: 'gone' } : retry(code ?? 'status_404');
  if ([408, 425, 429].includes(status) || status >= 500 || (status === 409 && code === 'woo_rxdb_sync_record_locked')) {
    return retry(code ?? `status_${status}`);
  }
  if (push === 'read' && (status === 200 || status === 201)) {
    return refused('read_accepted', 'The store accepted the read as a change, so nothing more was sent.');
  }
  if (status < 400) return retry(`status_${status}`);
  const refusal = code ?? `status_${status}`;
  return refused(refusal, text(body.message)?.slice(0, 200) ?? refusal);
}

/**
 * WCPOS 2.0: a read push (`baseRevision:'none'`, empty payload) answers 409 with the order as the store has it; only when
 * that record shows nothing paid is a cancel pushed, with exactly the revision that answer carried. The store itself does
 * not refuse a cancel of a part-paid order, so this check fails closed.
 */
export const wooSettleRefusedOrder: RefusedOrderSettlement = {
  cancel: async (context, { storeOrderId, clientOrderId, attemptId }) => {
    const { call } = createWooCall({ baseUrl: context.baseUrl, getHeaders: () => context.headers, fetch: context.fetch });
    const push = (mutationId: string, baseRevision: string, payload: Row) => call('push/orders', { method: 'POST',
      body: { mutationId, operation: 'update', collection: 'orders', recordId: clientOrderId, baseRevision, payload } });
    // The attempt id at version nibble 8, as transport.ts derives the close command id: never equal to the attempt id.
    const read = await push(`${attemptId.slice(0, 14)}8${attemptId.slice(15)}`, 'none', {});
    if (!isConflict(read)) return otherAnswer(read, 'read');
    let verdict = assess(read.body as Row, storeOrderId);
    for (let sent = 0; verdict.kind === 'cancellable'; sent += 1) {
      if (sent === MAX_CANCELS) return retry('conflict');
      const answer = await push(attemptId, verdict.revision, { status: 'cancelled' });
      if (answer.status === 200 || answer.status === 201) {
        return isRow(answer.body) && isRow(answer.body.document) && answer.body.document.status === 'cancelled'
          ? { kind: 'done', status: 'cancelled' }
          : retry(answer.aborted ? 'timeout' : 'bad_body');
      }
      if (!isConflict(answer)) return otherAnswer(answer, 'cancel');
      verdict = assess(answer.body as Row, storeOrderId);
    }
    return verdict;
  },
};
