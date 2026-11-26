import { ConnectorUnauthorizedError, type RefusedOrderSettlement, type SettleCancelRequest, type SettleOutcome, type SettlePayment, type SettlePayRequest, type SettlePayResult, type SettleReverseLeg, type SettleReverseRequest, type SettleReverseResult, type SyncContext } from '@tallyui/core';
import { minor, paymentLedger } from '../orders';
import { createWooCall, type Answer } from './http';
import { paymentRecordBody } from './money-body';

type Row = Record<string, unknown>;
type Assessment = SettleOutcome | { kind: 'cancellable'; revision: string };

const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' && value.length > 0 ? value : undefined);
/** Only an explicit null or empty date is unpaid; an absent key is an incomplete record, and the check fails closed. */
const blank = (value: unknown) => value === null || value === '';
const retry = (reason: string): SettleOutcome => ({ kind: 'retry', reason });
const refused = (code: string, message: string): SettleOutcome => ({ kind: 'refused', code, message });
const unreadable = () => refused('ledger_unreadable', "The store's payment record for this order could not be read.");

/** Ledger rows that hold no money; every other status (captured, authorized, pending, refunded, …) means money moved or may. */
const NO_MONEY = new Set(['failed', 'voided']);
/** At most this many cancel pushes per call: the first, and one resend after a conflict that still reads as cancellable. */
const MAX_CANCELS = 2;
const isConflict = (answer: Answer) => answer.status === 409 && isRow(answer.body) && answer.body.code === 'woo_rxdb_sync_conflict';

type Ledger = { current: Row; status: string; currency: string; revision: string; rows: Row[]; capturedMinor: number };

/** The store's current record and ledger rows, from a 409 conflict body, or why it cannot be trusted. */
function readLedger(body: Row, storeOrderId: string): Ledger | SettleOutcome {
  const current = body.current;
  const revision = text(body.currentRevision);
  if (!isRow(current) || !revision || !text(current.status) || !text(current.currency) || !Array.isArray(current.meta_data)) {
    return retry('bad_body');
  }
  const status = current.status as string;
  const currency = current.currency as string;
  if (String(current.id) !== storeOrderId) return refused('order_mismatch', 'The store answered with a different order.');
  // paymentLedger reads the first entry only; a second one could hold money the first does not show.
  if (current.meta_data.filter((meta) => isRow(meta) && meta.key === '_wcpos_payments').length > 1) return unreadable();
  const ledger = paymentLedger(current.meta_data);
  if (ledger.present && ledger.payments === null) return unreadable();
  const payments = ledger.payments ?? [];
  if (!payments.every((row) => isRow(row) && text(row.status))) return unreadable();
  const rows = payments as Row[];
  let capturedMinor = 0;
  for (const row of rows) {
    if (row.status !== 'captured') continue;
    if (typeof row.currency === 'string' && row.currency !== currency) return unreadable();
    try {
      capturedMinor += minor(row.amount, currency);
    } catch {
      return unreadable();
    }
  }
  return { current, status, currency, revision, rows, capturedMinor };
}

/** The store's current record, from a 409 conflict body: cancellable only when it shows nothing paid and is still waiting. */
function assess(body: Row, storeOrderId: string): Assessment {
  const read = readLedger(body, storeOrderId);
  if (!('rows' in read)) return read;
  const { current, status, revision, rows, capturedMinor } = read;
  const unpaid = rows.every((row) => NO_MONEY.has(row.status as string)) && blank(current.date_paid) && blank(current.date_paid_gmt);
  if (unpaid && status === 'cancelled') return { kind: 'done', status: 'cancelled' };
  if (unpaid && (status === 'pending' || status === 'pos-open')) return { kind: 'cancellable', revision };
  return { kind: 'changed', status, capturedMinor };
}

/** Ledger statuses with no money in motion: captured holds it, failed and voided hold none; any other (authorized, …) may move. */
const SETTLED_ROW = new Set(['captured', 'failed', 'voided']);
/** Order statuses that still wait for payment. */
const OPEN = new Set(['pending', 'pos-open', 'pos-partial']);
type PayAssessment = SettlePayResult | { send: SettlePayment[]; revision: string; recorded: string[] };

/**
 * Fails closed: the till's unsent legs are sent only when the order still waits and its due (`total` less every captured
 * row) is exactly their sum. `recorded` is the request's ids the store holds as captured; one of them in any other state is
 * a refusal, and any row with money in motion is `changed`. With nothing left to send, only `completed` is done.
 */
function assessPay(body: Row, request: SettlePayRequest): PayAssessment {
  const read = readLedger(body, request.storeOrderId);
  if (!('rows' in read)) return { outcome: read, recorded: [] };
  const { current, status, currency, rows, capturedMinor } = read;
  let totalMinor: number;
  try {
    totalMinor = minor(current.total, currency);
  } catch {
    return { outcome: retry('bad_body'), recorded: [] };
  }
  if (request.currency !== currency) return { outcome: refused('currency_mismatch', 'The store order is in another currency.'), recorded: [] };
  const mine = rows.filter((row) => request.payments.some((payment) => payment.id === row.id));
  const recorded = request.payments.filter((payment) => mine.some((row) => row.id === payment.id && row.status === 'captured')).map(({ id }) => id);
  if (mine.some((row) => row.status !== 'captured')) return { outcome: refused('payment_refused', 'The store refused a payment from this till.'), recorded };
  const changed = { outcome: { kind: 'changed' as const, status, capturedMinor }, recorded };
  if (rows.some((row) => !SETTLED_ROW.has(row.status as string))) return changed;
  const unsent = request.payments.filter((payment) => !recorded.includes(payment.id));
  if (unsent.length === 0) {
    return status === 'completed' ? { outcome: { kind: 'done', status }, recorded }
      : OPEN.has(status) ? { outcome: retry('not_completed'), recorded } : changed;
  }
  const dueMinor = totalMinor - capturedMinor;
  return OPEN.has(status) && dueMinor === unsent.reduce((sum, payment) => sum + payment.amountMinor, 0)
    ? { send: unsent, revision: read.revision, recorded } : changed;
}

function assessReverse(body: Row, request: SettleReverseRequest): SettleReverseResult | { toVoid: SettleReverseLeg[]; voided: string[]; revision: string } {
  const read = readLedger(body, request.storeOrderId);
  if (!('rows' in read)) return { outcome: read, voided: [] };
  const { current, status, rows, capturedMinor, revision } = read;
  const toVoid: SettleReverseLeg[] = [], voided: string[] = [];
  const changed = { outcome: { kind: 'changed' as const, status, capturedMinor }, voided };
  let invalid = false;
  for (const leg of request.legs) {
    const matches = rows.filter((row) => row.id === leg.paymentId);
    const row = matches[0];
    if (matches.length !== 1 || (row.method_id !== 'pos_cash' && row.method_id !== 'pos_card')) invalid = true;
    else if (row.status === 'voided') voided.push(leg.paymentId);
    else if (row.status === 'captured') toVoid.push(leg);
    else invalid = true;
  }
  if (invalid || rows.some((row) => !request.legs.some((leg) => leg.paymentId === row.id) && !NO_MONEY.has(row.status as string))) return changed;
  if (!blank(current.date_paid) || !blank(current.date_paid_gmt)) return changed;
  if (status === 'cancelled' && !toVoid.length) return { outcome: { kind: 'done', status }, voided };
  return OPEN.has(status) ? { toVoid, voided, revision } : changed;
}

/** Any answer to a record other than a 2xx with a revision (a stale revision aside, which the caller resends). */
function recordAnswer(answer: Answer): SettleOutcome {
  const { status } = answer;
  const body = isRow(answer.body) ? answer.body : {};
  const code = text(body.code);
  if (status === 401) throw new ConnectorUnauthorizedError(`WooCommerce order settle: HTTP ${status}`, 401);
  if (status === 0) return retry(answer.aborted ? 'timeout' : 'network');
  if (status >= 200 && status < 300) return retry(answer.aborted ? 'timeout' : 'bad_body');
  if ([408, 425, 429].includes(status) || status >= 500
    || (status === 409 && (code === 'wcpos_payment_locked' || code === 'woo_rxdb_sync_record_locked'))) return retry(code ?? `status_${status}`);
  // Only known refusals are terminal, as the sale transport has it.
  if (code && (code.startsWith('wcpos_') || code === 'rest_invalid_param' || code === 'rest_forbidden')) {
    return refused(code, text(body.message)?.slice(0, 200) ?? code);
  }
  return retry(code ?? `status_${status}`);
}

/** The settle pushes, and the read's mutation id: the attempt id at version nibble 8, as transport.ts derives the close
 * command id, never equal to the attempt id. A read is always refused, and a refused mutationId is not stored, so every
 * read of an attempt may carry it. */
function settleCalls(context: SyncContext, clientOrderId: string) {
  const { call } = createWooCall({ baseUrl: context.baseUrl, getHeaders: () => context.headers, fetch: context.fetch });
  const push = (mutationId: string, baseRevision: string, payload: Row) => call('push/orders', { method: 'POST',
    body: { mutationId, operation: 'update', collection: 'orders', recordId: clientOrderId, baseRevision, payload } });
  return { call, push, read: (attemptId: string) => push(`${attemptId.slice(0, 14)}8${attemptId.slice(15)}`, 'none', {}) };
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
async function cancelOrder(context: SyncContext, { storeOrderId, clientOrderId, attemptId }: SettleCancelRequest): Promise<SettleOutcome> {
  const { push, read: readOrder } = settleCalls(context, clientOrderId);
  const read = await readOrder(attemptId);
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
}

export const wooSettleRefusedOrder: RefusedOrderSettlement = {
  cancel: cancelOrder,
  reverse: async (context, request) => {
    const { call, read } = settleCalls(context, request.clientOrderId);
    const answer = await read(request.attemptId);
    if (!isConflict(answer)) return { outcome: otherAnswer(answer, 'read'), voided: [] };
    const verdict = assessReverse(answer.body as Row, request);
    if ('outcome' in verdict) return verdict;
    const confirmed = new Set(verdict.voided);
    const result = (outcome: SettleOutcome) => ({ outcome, voided: request.legs.map(({ paymentId }) => paymentId).filter((id) => confirmed.has(id)) });
    let revision = verdict.revision;
    for (const leg of verdict.toVoid) {
      const path = `orders/${request.storeOrderId}/payments/${leg.paymentId}/void`;
      const body = { command_id: leg.commandId, reason: 'given back at the till' };
      let reply = await call(path, { method: 'POST', body: { ...body, revision } });
      for (let resent = 0; reply.status === 409 && isRow(reply.body) && reply.body.code === 'wcpos_revision_stale'; resent += 1) {
        const stale = isRow(reply.body.data) ? text(reply.body.data.currentRevision) : undefined;
        if (resent === 1 || !stale) return result(retry('conflict'));
        reply = await call(path, { method: 'POST', body: { ...body, revision: stale } });
      }
      const next = reply.status >= 200 && reply.status < 300 && isRow(reply.body) ? text(reply.body.revision) : undefined;
      if (!next) return result(recordAnswer(reply));
      confirmed.add(leg.paymentId);
      revision = next;
    }
    return result(await cancelOrder(context, request));
  },
  // No close is sent: the record that covers the balance completes a paid order. A 2xx alone is never done; a re-read decides.
  pay: async (context, request) => {
    const { call, read } = settleCalls(context, request.clientOrderId);
    const assessRead = async (recorded: string[]): Promise<PayAssessment> => {
      const answer = await read(request.attemptId);
      return isConflict(answer) ? assessPay(answer.body as Row, request) : { outcome: otherAnswer(answer, 'read'), recorded };
    };
    const verdict = await assessRead([]);
    if (!('send' in verdict)) return verdict;
    const recorded = [...verdict.recorded];
    const path = `orders/${request.storeOrderId}/payments`;
    let revision = verdict.revision;
    for (const payment of verdict.send) {
      const body = paymentRecordBody(payment, request.currency);
      let answer = await call(path, { method: 'POST', body: { ...body, revision } });
      // A stale revision is resent once, same body, with the store's, as transport.ts does.
      for (let resent = 0; answer.status === 409 && isRow(answer.body) && answer.body.code === 'wcpos_revision_stale'; resent += 1) {
        const stale = isRow(answer.body.data) ? text(answer.body.data.currentRevision) : undefined;
        if (resent === 1 || !stale) return { outcome: retry('conflict'), recorded };
        answer = await call(path, { method: 'POST', body: { ...body, revision: stale } });
      }
      const next = answer.status >= 200 && answer.status < 300 && isRow(answer.body) ? text(answer.body.revision) : undefined;
      if (!next) return { outcome: recordAnswer(answer), recorded };
      recorded.push(payment.id);
      revision = next;
    }
    const after = await assessRead(recorded);
    return 'send' in after ? { outcome: retry('not_completed'), recorded: after.recorded } : after;
  },
};
