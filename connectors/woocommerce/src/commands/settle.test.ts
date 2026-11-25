import { describe, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError, type SyncContext } from '@tallyui/core';
import { wooSettleRefusedOrder } from './settle';

const baseUrl = 'https://shop.example/wp-json/wcpos/v2';
const attemptId = '019abcde-0000-7000-8000-000000000001';
const readId = '019abcde-0000-8000-8000-000000000001';
const clientOrderId = '2d836506-85ef-40f6-a5cb-252cef011079';
const rev = (n: number) => `sha256:${String(n).repeat(64)}`;
type Row = Record<string, unknown>;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
// The B1-03 read (pending, no payment yet), trimmed to the fields the check reads.
const order = (over: Row = {}, meta: unknown[] = []): Row => ({
  id: 16, status: 'pending', currency: 'USD', total: '10.000000', date_paid: null, date_paid_gmt: null, number: '16',
  meta_data: [{ id: 34, key: '_pos_user', value: '2' }, { id: 33, key: '_woocommerce_pos_uuid', value: clientOrderId }, ...meta], ...over,
});
const ledger = (payments: unknown, schema: unknown = 1) => ({ id: 45, key: '_wcpos_payments', value: { schema, payments } });
const payment = (status: string, over: Row = {}): Row => ({ id: '91078e8d-57c2-4d7f-91d9-84f2dd94c920', method_id: 'pos_cash', amount: '5.00', currency: 'USD', status, ...over });
const conflict = (current: unknown, currentRevision: unknown = rev(1)) =>
  json(409, { code: 'woo_rxdb_sync_conflict', message: 'baseRevision is stale.', current, currentRevision });
// The A1-03 answer: 200 { document, currentRevision }.
const cancelled = () => json(200, { document: order({ status: 'cancelled' }), currentRevision: rev(9) });
// The F1-04 answer for a trashed, deleted or unknown uuid.
const notFound = () => json(404, { code: 'woo_rxdb_sync_record_not_found', message: 'No record for recordId.', data: { status: 404 } });

function store(replies: Array<Response | Error>, storeOrderId = '16') {
  const calls: Array<{ url: string; method?: string; body: ReturnType<typeof JSON.parse> }> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    calls.push({ url: String(url), method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const reply = replies.shift();
    if (!reply || reply instanceof Error) throw reply ?? new Error('no reply queued');
    return reply;
  });
  const context: SyncContext = { connectorId: 'woocommerce', baseUrl, headers: { Authorization: 'Bearer t' }, fetch };
  return { calls, cancel: () => wooSettleRefusedOrder.cancel!(context, { storeOrderId, clientOrderId, attemptId }) };
}
const push = (mutationId: string, baseRevision: string, payload: Row) => ({ url: `${baseUrl}/push/orders`, method: 'POST',
  body: { mutationId, operation: 'update', collection: 'orders', recordId: clientOrderId, baseRevision, payload } });

describe('wooSettleRefusedOrder.cancel', () => {
  it('1: reads with an empty payload, then cancels a pending unpaid order with the revision the read returned', async () => {
    const { calls, cancel } = store([conflict(order()), cancelled()]);
    await expect(cancel()).resolves.toStrictEqual({ kind: 'done', status: 'cancelled' });
    expect(calls).toStrictEqual([push(readId, 'none', {}), push(attemptId, rev(1), { status: 'cancelled' })]);
    expect(Object.keys(calls[0].body.payload)).toStrictEqual([]);
  });

  it('2: cancels a pos-open unpaid order', async () => {
    const { calls, cancel } = store([conflict(order({ status: 'pos-open' })), cancelled()]);
    await expect(cancel()).resolves.toStrictEqual({ kind: 'done', status: 'cancelled' });
    expect(calls).toHaveLength(2);
  });

  it('3: cancels when the ledger holds only failed and voided rows', async () => {
    const { calls, cancel } = store([conflict(order({}, [ledger([payment('failed'), payment('voided')])])), cancelled()]);
    await expect(cancel()).resolves.toStrictEqual({ kind: 'done', status: 'cancelled' });
    expect(calls).toHaveLength(2);
  });

  it('4: a pos-partial order with 5.00 captured (C-04) is changed, nothing cancelled', async () => {
    const current = order({ id: 17, status: 'pos-partial', payment_method: 'pos_cash', number: '17' }, [ledger([payment('captured')])]);
    const { calls, cancel } = store([conflict(current)], '17');
    await expect(cancel()).resolves.toStrictEqual({ kind: 'changed', status: 'pos-partial', capturedMinor: 500 });
    expect(calls).toHaveLength(1);
  });

  it('5: a pending order with a captured row is changed', async () => {
    const { calls, cancel } = store([conflict(order({}, [ledger([payment('captured')])]))]);
    await expect(cancel()).resolves.toStrictEqual({ kind: 'changed', status: 'pending', capturedMinor: 500 });
    expect(calls).toHaveLength(1);
  });

  it.each(['authorized', 'pending', 'refunded'])('6: a pending order with a %s row holds money and is changed', async (status) => {
    const { calls, cancel } = store([conflict(order({}, [ledger([payment(status)])]))]);
    await expect(cancel()).resolves.toStrictEqual({ kind: 'changed', status: 'pending', capturedMinor: 0 });
    expect(calls).toHaveLength(1);
  });

  it.each([{ date_paid: '2026-11-25T21:29:25' }, { date_paid_gmt: '2026-11-25T21:29:25' }])('7: a pending order paid by date (%o) is changed', async (dates) => {
    const { calls, cancel } = store([conflict(order(dates))]);
    await expect(cancel()).resolves.toStrictEqual({ kind: 'changed', status: 'pending', capturedMinor: 0 });
    expect(calls).toHaveLength(1);
  });

  it.each([
    ['schema 2', ledger([], 2)],
    ['a string value', { id: 45, key: '_wcpos_payments', value: 'x' }],
    ['a row without a status', ledger([{ amount: '5.00' }])],
    ['a captured row with amount x', ledger([payment('captured', { amount: 'x' })])],
    ['a captured row in EUR on a USD order', ledger([payment('captured', { currency: 'EUR' })])],
  ])('8: a ledger with %s is refused as unreadable', async (_name, meta) => {
    const { calls, cancel } = store([conflict(order({}, [meta]))]);
    await expect(cancel()).resolves.toMatchObject({ kind: 'refused', code: 'ledger_unreadable' });
    expect(calls).toHaveLength(1);
  });

  it('9: a read whose order id differs is refused', async () => {
    const { calls, cancel } = store([conflict(order({ id: 99 }))]);
    await expect(cancel()).resolves.toMatchObject({ kind: 'refused', code: 'order_mismatch' });
    expect(calls).toHaveLength(1);
  });

  it('10: an order already cancelled with no money (A1-07) is done with no cancel sent', async () => {
    const { calls, cancel } = store([conflict(order({ status: 'cancelled' }))]);
    await expect(cancel()).resolves.toStrictEqual({ kind: 'done', status: 'cancelled' });
    expect(calls).toHaveLength(1);
  });

  it('11: an order cancelled with a captured row is changed', async () => {
    const { calls, cancel } = store([conflict(order({ status: 'cancelled' }, [ledger([payment('captured')])]))]);
    await expect(cancel()).resolves.toStrictEqual({ kind: 'changed', status: 'cancelled', capturedMinor: 500 });
    expect(calls).toHaveLength(1);
  });

  it('12: a cancel conflict still pending is sent once more with the new revision and the same mutationId', async () => {
    const { calls, cancel } = store([conflict(order()), conflict(order(), rev(2)), cancelled()]);
    await expect(cancel()).resolves.toStrictEqual({ kind: 'done', status: 'cancelled' });
    expect(calls).toStrictEqual([push(readId, 'none', {}), push(attemptId, rev(1), { status: 'cancelled' }), push(attemptId, rev(2), { status: 'cancelled' })]);
  });

  it('13: a cancel conflict that shows a captured row is changed', async () => {
    const { calls, cancel } = store([conflict(order()), conflict(order({ status: 'pos-partial' }, [ledger([payment('captured')])]), rev(2))]);
    await expect(cancel()).resolves.toStrictEqual({ kind: 'changed', status: 'pos-partial', capturedMinor: 500 });
    expect(calls).toHaveLength(2);
  });

  it('14: two cancel conflicts, still pending, give retry conflict after three pushes', async () => {
    const { calls, cancel } = store([conflict(order()), conflict(order(), rev(2)), conflict(order(), rev(3)), cancelled()]);
    await expect(cancel()).resolves.toStrictEqual({ kind: 'retry', reason: 'conflict' });
    expect(calls).toHaveLength(3);
  });

  it('15: record_not_found on the read or on the cancel is gone', async () => {
    const read = store([notFound()]);
    await expect(read.cancel()).resolves.toStrictEqual({ kind: 'gone' });
    expect(read.calls).toHaveLength(1);
    const cancelPush = store([conflict(order()), notFound()]);
    await expect(cancelPush.cancel()).resolves.toStrictEqual({ kind: 'gone' });
    expect(cancelPush.calls).toHaveLength(2);
  });

  it('16: any other 404 says nothing about the order and is retry', async () => {
    const { calls, cancel } = store([json(404, { code: 'rest_no_route', message: 'No route' })]);
    await expect(cancel()).resolves.toStrictEqual({ kind: 'retry', reason: 'rest_no_route' });
    expect(calls).toHaveLength(1);
  });

  const transient: Array<[string, () => Response | Error, string]> = [
    ['a network error', () => new TypeError('Failed to fetch'), 'network'],
    ['500', () => json(500, { message: 'boom' }), 'status_500'],
    ['503', () => new Response('<html>', { status: 503 }), 'status_503'],
    ['429', () => json(429, { code: 'rate_limited' }), 'rate_limited'],
    ['409 record_locked', () => json(409, { code: 'woo_rxdb_sync_record_locked' }), 'woo_rxdb_sync_record_locked'],
  ];
  it.each(transient)('17: %s on the read or on the cancel is retry', async (_name, reply, reason) => {
    const read = store([reply()]);
    await expect(read.cancel()).resolves.toStrictEqual({ kind: 'retry', reason });
    expect(read.calls).toHaveLength(1);
    const cancelPush = store([conflict(order()), reply()]);
    await expect(cancelPush.cancel()).resolves.toStrictEqual({ kind: 'retry', reason });
    expect(cancelPush.calls).toHaveLength(2);
  });

  it('18: 401 on the read or on the cancel rejects with ConnectorUnauthorizedError', async () => {
    const read = store([json(401, { code: 'wcpos_token_invalid' })]);
    const error = await read.cancel().catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(ConnectorUnauthorizedError);
    expect(error).toMatchObject({ status: 401 });
    expect(read.calls).toHaveLength(1);
    const cancelPush = store([conflict(order()), json(401, {})]);
    await expect(cancelPush.cancel()).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
    expect(cancelPush.calls).toHaveLength(2);
  });

  it('19: other 4xx answers are refused with the store code and message', async () => {
    const long = 'm'.repeat(300);
    const money = store([conflict(order()), json(422, { code: 'wcpos_money_in_motion', message: long })]);
    await expect(money.cancel()).resolves.toStrictEqual({ kind: 'refused', code: 'wcpos_money_in_motion', message: 'm'.repeat(200) });
    expect(money.calls).toHaveLength(2);
    const forbidden = store([json(403, { code: 'rest_forbidden', message: 'Sorry, you are not allowed to do that.' })]);
    await expect(forbidden.cancel()).resolves.toStrictEqual({ kind: 'refused', code: 'rest_forbidden', message: 'Sorry, you are not allowed to do that.' });
    expect(forbidden.calls).toHaveLength(1);
    const goneStatus = store([new Response('', { status: 410 })]);
    await expect(goneStatus.cancel()).resolves.toStrictEqual({ kind: 'refused', code: 'status_410', message: 'status_410' });
    expect(goneStatus.calls).toHaveLength(1);
  });

  it('20: a read the store accepts is refused read_accepted, and no cancel is sent', async () => {
    const { calls, cancel } = store([json(200, { document: order(), currentRevision: rev(2) }), cancelled()]);
    await expect(cancel()).resolves.toMatchObject({ kind: 'refused', code: 'read_accepted' });
    expect(calls).toHaveLength(1);
  });

  it.each([
    ['a document still pending', () => json(200, { document: order(), currentRevision: rev(2) })],
    ['no JSON', () => new Response('<html>', { status: 200 })],
  ])('21: a 200 cancel answer with %s is retry bad_body', async (_name, reply) => {
    const { calls, cancel } = store([conflict(order()), reply()]);
    await expect(cancel()).resolves.toStrictEqual({ kind: 'retry', reason: 'bad_body' });
    expect(calls).toHaveLength(2);
  });

  it('22: a captured 500 on a JPY order counts 500 minor units', async () => {
    const { calls, cancel } = store([conflict(order({ currency: 'JPY' }, [ledger([payment('captured', { amount: '500', currency: 'JPY' })])]))]);
    await expect(cancel()).resolves.toStrictEqual({ kind: 'changed', status: 'pending', capturedMinor: 500 });
    expect(calls).toHaveLength(1);
  });

  it.each([undefined, ''])('23: a read with currentRevision %o is retry bad_body, no cancel', async (currentRevision) => {
    const read = json(409, { code: 'woo_rxdb_sync_conflict', message: 'baseRevision is stale.', current: order(), currentRevision });
    const { calls, cancel } = store([read, cancelled()]);
    await expect(cancel()).resolves.toStrictEqual({ kind: 'retry', reason: 'bad_body' });
    expect(calls).toHaveLength(1);
  });
});
