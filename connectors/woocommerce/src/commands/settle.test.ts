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
  return { calls, cancel: () => wooSettleRefusedOrder.cancel!(context, { storeOrderId, clientOrderId, attemptId }),
    reverse: (legs: { paymentId: string; commandId: string; amountMinor: number }[]) => wooSettleRefusedOrder.reverse!(context, { storeOrderId, clientOrderId, attemptId, legs }) };
}
const push = (mutationId: string, baseRevision: string, payload: Row) => ({ url: `${baseUrl}/push/orders`, method: 'POST',
  body: { mutationId, operation: 'update', collection: 'orders', recordId: clientOrderId, baseRevision, payload } });

describe('wooSettleRefusedOrder.reverse', () => {
  const cash = { paymentId: '019abcde-0000-7000-8000-0000000000aa', commandId: '019abcde-0000-7000-8000-0000000000a1', amountMinor: 1000 };
  const card = { paymentId: '019abcde-0000-7000-8000-0000000000bb', commandId: '019abcde-0000-7000-8000-0000000000b2', amountMinor: 500 };
  const cashRow = payment('captured', { id: cash.paymentId, amount: '10.00' });
  const cardRow = payment('captured', { id: card.paymentId, method_id: 'pos_card' });
  const read = (rows: Row[] = [cashRow], over: Row = {}, revision = rev(1)) => conflict(order({ status: 'pos-partial', ...over }, [ledger(rows)]), revision);
  const open = () => read([{ ...cashRow, status: 'voided' }], { status: 'pos-open' }, rev(4));
  const ok = (revision = rev(2)) => json(200, { revision });
  const done = { kind: 'done', status: 'cancelled' };
  const readPush = push(readId, 'none', {}), cancelPush = push(attemptId, rev(4), { status: 'cancelled' });
  const voidPost = (leg: typeof cash, revision: string) => ({ url: `${baseUrl}/orders/16/payments/${leg.paymentId}/void`, method: 'POST',
    body: { command_id: leg.commandId, revision, reason: 'given back at the till' } });

  it('row 1: void cash then cancel with the fresh read revision', async () => {
    const shop = store([read(), ok(), open(), cancelled()]);
    expect(await shop.reverse([cash])).toEqual({ outcome: done, voided: [cash.paymentId] });
    expect(shop.calls).toEqual([readPush, voidPost(cash, rev(1)), readPush, cancelPush]);
  });
  it('row 2: void both legs in request order with chained revisions', async () => {
    const shop = store([read([cardRow, cashRow]), ok(), ok(rev(3)), open(), cancelled()]);
    expect(await shop.reverse([cash, card])).toEqual({ outcome: done, voided: [cash.paymentId, card.paymentId] });
    expect(shop.calls).toEqual([readPush, voidPost(cash, rev(1)), voidPost(card, rev(2)), readPush, cancelPush]);
  });
  it('row 3: a refused second void stops before the cancel read', async () => {
    const shop = store([read([cashRow, cardRow]), ok(), json(409, { code: 'wcpos_invalid_transition' })]);
    expect(await shop.reverse([cash, card])).toMatchObject({ outcome: { kind: 'refused', code: 'wcpos_invalid_transition' }, voided: [cash.paymentId] });
    expect(shop.calls).toEqual([readPush, voidPost(cash, rev(1)), voidPost(card, rev(2))]);
  });
  it('row 4: repeat a lost cancel read without another void', async () => {
    const shop = store([read(), ok(), new Error('offline'), open(), open(), cancelled()]);
    expect(await shop.reverse([cash])).toMatchObject({ outcome: { kind: 'retry' }, voided: [cash.paymentId] });
    expect(await shop.reverse([cash])).toEqual({ outcome: done, voided: [cash.paymentId] });
    expect(shop.calls).toEqual([readPush, voidPost(cash, rev(1)), readPush, readPush, readPush, cancelPush]);
  });
  it('row 5: a completed order is not touched', async () => {
    const shop = store([read([cashRow], { status: 'completed', date_paid: '2026-11-25' })]);
    expect(await shop.reverse([cash])).toEqual({ outcome: { kind: 'changed', status: 'completed', capturedMinor: 1000 }, voided: [] });
    expect(shop.calls).toEqual([readPush]);
  });
  it('row 6: resend a stale void once with its command id', async () => {
    const stale = () => json(409, { code: 'wcpos_revision_stale', data: { currentRevision: rev(3) } });
    for (const twice of [false, true]) {
      const shop = store([read(), stale(), ...(twice ? [stale()] : [ok(), open(), cancelled()])]);
      expect(await shop.reverse([cash])).toEqual(twice ? { outcome: { kind: 'retry', reason: 'conflict' }, voided: [] } : { outcome: done, voided: [cash.paymentId] });
      expect(shop.calls).toEqual([readPush, voidPost(cash, rev(1)), voidPost(cash, rev(3)), ...(twice ? [] : [readPush, cancelPush])]);
    }
  });
  it('row 7: refuse to void provider money under either id', async () => {
    for (const rows of [[{ ...cashRow, method_id: 'stripe' }], [cashRow, { ...cardRow, method_id: 'stripe' }]]) {
      const shop = store([read(rows)]);
      expect(await shop.reverse([cash])).toMatchObject({ outcome: { kind: 'changed' }, voided: [] });
      expect(shop.calls).toEqual([readPush]);
    }
  });
  it('row 8: a new capture before cancel stops the run', async () => {
    const shop = store([read(), ok(), read([{ ...cashRow, status: 'voided' }, cardRow])]);
    expect(await shop.reverse([cash])).toEqual({ outcome: { kind: 'changed', status: 'pos-partial', capturedMinor: 500 }, voided: [cash.paymentId] });
    expect(shop.calls).toEqual([readPush, voidPost(cash, rev(1)), readPush]);
  });
  it('row 9: a resolver 404 is gone', async () => {
    const shop = store([notFound()]);
    expect(await shop.reverse([cash])).toEqual({ outcome: { kind: 'gone' }, voided: [] });
    expect(shop.calls).toEqual([readPush]);
  });
  it('row 10: missing, failed or ambiguous rows and other authorizations stop the run', async () => {
    for (const rows of [[], [{ ...cashRow, status: 'failed' }], [cashRow, cashRow], [cashRow, { ...cardRow, status: 'authorized' }]]) {
      const shop = store([read(rows)]);
      expect(await shop.reverse([cash])).toMatchObject({ outcome: { kind: 'changed' }, voided: [] });
      expect(shop.calls).toEqual([readPush]);
    }
  });
  it('row 11: cancelled replay requires all legs voided', async () => {
    for (const status of ['captured', 'voided']) {
      const shop = store([read([{ ...cashRow, status }], { status: 'cancelled' })]);
      expect(await shop.reverse([cash])).toEqual(status === 'voided' ? { outcome: done, voided: [cash.paymentId] }
        : { outcome: { kind: 'changed', status: 'cancelled', capturedMinor: 1000 }, voided: [] });
      expect(shop.calls).toEqual([readPush]);
    }
  });
  it('row 12: unauthorized void throws', async () => {
    const shop = store([read(), json(401, {})]);
    await expect(shop.reverse([cash])).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
    expect(shop.calls).toEqual([readPush, voidPost(cash, rev(1))]);
  });
  it('row 13: retry a locked or unavailable second void without repeating the first', async () => {
    for (const unavailable of [json(503, {}), json(409, { code: 'wcpos_payment_locked' })]) {
      const shop = store([read([cashRow, cardRow]), ok(), unavailable, read([{ ...cashRow, status: 'voided' }, cardRow]), ok(), open(), cancelled()]);
      expect(await shop.reverse([cash, card])).toMatchObject({ outcome: { kind: 'retry' }, voided: [cash.paymentId] });
      expect(await shop.reverse([cash, card])).toEqual({ outcome: done, voided: [cash.paymentId, card.paymentId] });
      expect(shop.calls).toEqual([readPush, voidPost(cash, rev(1)), voidPost(card, rev(2)), readPush, voidPost(card, rev(1)), readPush, cancelPush]);
    }
  });
  it.each([
    [{ ...cashRow, amount: '9.00' }, 'pos-partial', 900],
    [{ ...cashRow, status: 'voided', amount: '9.00' }, 'cancelled', 0],
    [{ ...cashRow, status: 'voided', currency: 'EUR' }, 'cancelled', 0],
  ] as const)('row 14: a store row whose amount or currency differs from the till leg is not voided', async (row, status, capturedMinor) => {
    const shop = store([read([row], { status })]);
    expect(await shop.reverse([cash])).toEqual({ outcome: { kind: 'changed', status, capturedMinor }, voided: [] });
    expect(shop.calls).toEqual([readPush]);
  });
  it('row 15: a void 2xx without a revision is retried and sends no cancel', async () => {
    const shop = store([read(), json(200, {})]);
    expect(await shop.reverse([cash])).toMatchObject({ outcome: { kind: 'retry' }, voided: [] });
    expect(shop.calls).toEqual([readPush, voidPost(cash, rev(1))]);
  });
});

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

  // JSON drops an undefined value, so `undefined` here sends the record without that key.
  it.each([['absent', undefined], ['null', null], ['an object', {}]])('24: a read with meta_data %s is retry bad_body, no cancel', async (_name, meta_data) => {
    const { calls, cancel } = store([conflict(order({ meta_data })), cancelled()]);
    await expect(cancel()).resolves.toStrictEqual({ kind: 'retry', reason: 'bad_body' });
    expect(calls).toHaveLength(1);
  });

  it('25: two _wcpos_payments entries (a failed row, then a captured row) are refused as unreadable, no cancel', async () => {
    const { calls, cancel } = store([conflict(order({}, [ledger([payment('failed')]), ledger([payment('captured')])])), cancelled()]);
    await expect(cancel()).resolves.toMatchObject({ kind: 'refused', code: 'ledger_unreadable' });
    expect(calls).toHaveLength(1);
  });

  it.each(['date_paid', 'date_paid_gmt'])('26: a pending order with no ledger and no %s key is changed, no cancel', async (key) => {
    const { calls, cancel } = store([conflict(order({ [key]: undefined })), cancelled()]);
    await expect(cancel()).resolves.toStrictEqual({ kind: 'changed', status: 'pending', capturedMinor: 0 });
    expect(calls).toHaveLength(1);
  });

  it('27: a cancel conflict whose current has no meta_data is retry bad_body, no second cancel', async () => {
    const { calls, cancel } = store([conflict(order()), conflict(order({ meta_data: undefined }), rev(2)), cancelled()]);
    await expect(cancel()).resolves.toStrictEqual({ kind: 'retry', reason: 'bad_body' });
    expect(calls).toHaveLength(2);
  });
});

// #1101 slice 3: record the till's unrecorded legs on a part-paid order. The till's first leg (cash 10.00) is on the store
// under its own id; each leg sent here goes under a new id the request names.
describe('wooSettleRefusedOrder.pay', () => {
  const tillId = '019abcde-0000-7000-8000-0000000000aa';
  const newA = '019abcde-0000-7000-8000-0000000000a1', newB = '019abcde-0000-7000-8000-0000000000b2';
  const paymentsUrl = `${baseUrl}/orders/16/payments`;
  type Leg = { id: string; method: 'cash' | 'external'; amountMinor: number; tenderedMinor?: number };
  const card20: Leg = { id: newA, method: 'external', amountMinor: 2000 };
  // A ledger row on the store, USD, by id.
  const row = (id: string, status: string, amount: string, method = 'pos_cash') => payment(status, { id, amount, method_id: method });
  const till10 = row(tillId, 'captured', '10.00');
  const partial = (rows: Row[], over: Row = {}) => order({ status: 'pos-partial', total: '30.00', ...over }, [ledger(rows)]);
  const paid = (rows: Row[]) => order({ status: 'completed', total: '30.00', date_paid: '2026-11-26T10:00:00' }, [ledger(rows)]);
  const recordedAnswer = (n: number) => json(201, { payment: {}, revision: rev(n) });
  const stale = (current: unknown) => json(409, { code: 'wcpos_revision_stale', message: 'Stale.', data: { status: 409, currentRevision: current } });
  function shop(replies: Array<Response | Error>, payments: Leg[] = [card20], currency = 'USD') {
    const calls: Array<{ url: string; body: ReturnType<typeof JSON.parse> }> = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const reply = replies.shift();
      if (!reply || reply instanceof Error) throw reply ?? new Error('no reply queued');
      return reply;
    });
    const context: SyncContext = { connectorId: 'woocommerce', baseUrl, headers: { Authorization: 'Bearer t' }, fetch };
    return { calls, records: () => calls.filter((call) => call.url === paymentsUrl).map((call) => call.body),
      pay: () => wooSettleRefusedOrder.pay!(context, { storeOrderId: '16', clientOrderId, attemptId, currency, payments }) };
  }
  const readCall = { url: `${baseUrl}/push/orders`, body: push(readId, 'none', {}).body };

  it('row 1: reads, records the card 20.00 under the new id with the read revision, re-reads completed: done', async () => {
    const { calls, pay } = shop([conflict(partial([till10])), recordedAnswer(2),
      conflict(paid([till10, row(newA, 'captured', '20.00', 'pos_card')]), rev(2))]);
    await expect(pay()).resolves.toStrictEqual({ outcome: { kind: 'done', status: 'completed' }, recorded: [newA] });
    expect(calls).toStrictEqual([readCall, { url: paymentsUrl, body: { payment: { id: newA, method_id: 'pos_card', amount: '20.00', currency: 'USD' }, revision: rev(1) } }, readCall]);
  });

  it('row 2: a cash leg sends tendered 50.00 and no change key', async () => {
    const cash: Leg = { id: newA, method: 'cash', amountMinor: 2000, tenderedMinor: 5000 };
    const { records, pay } = shop([conflict(partial([till10])), recordedAnswer(2), conflict(paid([till10, row(newA, 'captured', '20.00')]), rev(2))], [cash]);
    await expect(pay()).resolves.toMatchObject({ outcome: { kind: 'done' }, recorded: [newA] });
    expect(records()).toStrictEqual([{ payment: { id: newA, method_id: 'pos_cash', amount: '20.00', currency: 'USD', tendered: '50.00' }, revision: rev(1) }]);
  });

  it('row 3: two legs are recorded in leg order, the second with the first answer\'s revision', async () => {
    const legs: Leg[] = [{ id: newA, method: 'cash', amountMinor: 500 }, { id: newB, method: 'external', amountMinor: 1500 }];
    const card10 = row(tillId, 'captured', '10.00', 'pos_card');
    const { records, pay } = shop([conflict(partial([card10])), recordedAnswer(2), recordedAnswer(3),
      conflict(paid([card10, row(newA, 'captured', '5.00'), row(newB, 'captured', '15.00', 'pos_card')]), rev(3))], legs);
    await expect(pay()).resolves.toStrictEqual({ outcome: { kind: 'done', status: 'completed' }, recorded: [newA, newB] });
    expect(records().map((body) => [body.payment.id, body.payment.amount, body.revision])).toStrictEqual([[newA, '5.00', rev(1)], [newB, '15.00', rev(2)]]);
  });

  it('row 4: a stale record is resent once with currentRevision; a second stale answer is retry conflict', async () => {
    const once = shop([conflict(partial([till10])), stale(rev(5)), recordedAnswer(6), conflict(paid([till10, row(newA, 'captured', '20.00', 'pos_card')]), rev(6))]);
    await expect(once.pay()).resolves.toStrictEqual({ outcome: { kind: 'done', status: 'completed' }, recorded: [newA] });
    expect(once.records().map((body) => [body.payment.id, body.revision])).toStrictEqual([[newA, rev(1)], [newA, rev(5)]]);
    const twice = shop([conflict(partial([till10])), stale(rev(5)), stale(rev(6)), recordedAnswer(7)]);
    await expect(twice.pay()).resolves.toStrictEqual({ outcome: { kind: 'retry', reason: 'conflict' }, recorded: [] });
    expect(twice.records()).toHaveLength(2);
  });

  it('row 5: an order already completed on the store with no row of this till is changed, nothing posted', async () => {
    const { calls, pay } = shop([conflict(paid([till10, row('019abcde-0000-7000-8000-0000000000cc', 'captured', '20.00')]))]);
    await expect(pay()).resolves.toStrictEqual({ outcome: { kind: 'changed', status: 'completed', capturedMinor: 3000 }, recorded: [] });
    expect(calls).toHaveLength(1);
  });

  it('row 6: 15.00 captured where the till left 10.00 is changed with capturedMinor 1500, nothing posted', async () => {
    const { calls, pay } = shop([conflict(partial([till10, row('019abcde-0000-7000-8000-0000000000cc', 'captured', '5.00')]))]);
    await expect(pay()).resolves.toStrictEqual({ outcome: { kind: 'changed', status: 'pos-partial', capturedMinor: 1500 }, recorded: [] });
    expect(calls).toHaveLength(1);
  });

  it('row 7: an over-cover 400 is refused with what was recorded so far, and no further leg goes', async () => {
    const exceeds = () => json(400, { code: 'wcpos_amount_exceeds_balance', message: 'm'.repeat(300) });
    const legs: Leg[] = [{ id: newA, method: 'cash', amountMinor: 500 }, { id: newB, method: 'external', amountMinor: 1500 }];
    // 10.00 + 5.00 + 15.00 is the 30.00 total; the first record is refused, so the second is never sent.
    const first = shop([conflict(partial([till10])), exceeds(), recordedAnswer(3)], legs);
    await expect(first.pay()).resolves.toStrictEqual({ outcome: { kind: 'refused', code: 'wcpos_amount_exceeds_balance', message: 'm'.repeat(200) }, recorded: [] });
    expect(first.records()).toHaveLength(1);
    const second = shop([conflict(partial([till10])), recordedAnswer(2), exceeds(), recordedAnswer(4)], legs);
    await expect(second.pay()).resolves.toMatchObject({ outcome: { kind: 'refused', code: 'wcpos_amount_exceeds_balance' }, recorded: [newA] });
    expect(second.calls).toHaveLength(3);
  });

  it('row 8: a resend of the same attempt skips the id the store holds and records only the next one: done with both', async () => {
    const legs: Leg[] = [{ id: newA, method: 'cash', amountMinor: 500 }, { id: newB, method: 'external', amountMinor: 1500 }];
    const card10 = row(tillId, 'captured', '10.00', 'pos_card'), cash5 = row(newA, 'captured', '5.00');
    const { records, pay } = shop([conflict(partial([card10, cash5]), rev(2)), recordedAnswer(3),
      conflict(paid([card10, cash5, row(newB, 'captured', '15.00', 'pos_card')]), rev(3))], legs);
    await expect(pay()).resolves.toStrictEqual({ outcome: { kind: 'done', status: 'completed' }, recorded: [newA, newB] });
    expect(records()).toStrictEqual([{ payment: { id: newB, method_id: 'pos_card', amount: '15.00', currency: 'USD' }, revision: rev(2) }]);
  });

  it('a repeat whose first id the store holds as captured records only the second', async () => {
    const legs: Leg[] = [{ id: newA, method: 'cash', amountMinor: 500 }, { id: newB, method: 'external', amountMinor: 1500 }];
    const cash5 = row(newA, 'captured', '5.00');
    const { records, pay } = shop([conflict(partial([till10, cash5]), rev(2)), recordedAnswer(3),
      conflict(paid([till10, cash5, row(newB, 'captured', '15.00', 'pos_card')]), rev(3))], legs);
    await expect(pay()).resolves.toStrictEqual({ outcome: { kind: 'done', status: 'completed' }, recorded: [newA, newB] });
    expect(records()).toStrictEqual([{ payment: { id: newB, method_id: 'pos_card', amount: '15.00', currency: 'USD' }, revision: rev(2) }]);
  });

  it("the store's own due decides: store total 35.00, 15.00 captured, unsent 20.00 records", async () => {
    // The till sold for 30.00; the store's order reads 35.00, so its due is 35.00 - 15.00, the card 20.00 left.
    const other5 = row('019abcde-0000-7000-8000-0000000000cc', 'captured', '5.00');
    const { records, pay } = shop([conflict(partial([till10, other5], { total: '35.00' })), recordedAnswer(2),
      conflict(order({ status: 'completed', total: '35.00', date_paid: '2026-11-26T10:00:00' }, [ledger([till10, other5, row(newA, 'captured', '20.00', 'pos_card')])]), rev(2))]);
    await expect(pay()).resolves.toStrictEqual({ outcome: { kind: 'done', status: 'completed' }, recorded: [newA] });
    expect(records().map((body) => body.payment.amount)).toStrictEqual(['20.00']);
  });

  it.each<[string, () => Response | Error, string]>([
    ['status 0', () => new TypeError('Failed to fetch'), 'network'],
    ['503', () => new Response('<html>', { status: 503 }), 'status_503'],
    ['409 record_locked', () => json(409, { code: 'woo_rxdb_sync_record_locked' }), 'woo_rxdb_sync_record_locked'],
    ['409 payment_locked', () => json(409, { code: 'wcpos_payment_locked' }), 'wcpos_payment_locked'],
    ['a 2xx without a revision', () => json(201, { payment: {} }), 'bad_body'],
    ['an unknown 4xx code', () => json(404, { code: 'rest_no_route' }), 'rest_no_route'],
  ])('row 9: %s on the record is retry, nothing recorded', async (_name, reply, reason) => {
    const { records, pay } = shop([conflict(partial([till10])), reply(), recordedAnswer(9)]);
    await expect(pay()).resolves.toStrictEqual({ outcome: { kind: 'retry', reason }, recorded: [] });
    expect(records()).toHaveLength(1);
  });

  it('row 9: 401 on the record rejects with ConnectorUnauthorizedError', async () => {
    const { pay } = shop([conflict(partial([till10])), json(401, {})]);
    await expect(pay()).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
  });

  it('row 10: the uuid resolver\'s 404 on the read is gone, nothing posted', async () => {
    const { calls, pay } = shop([notFound()]);
    await expect(pay()).resolves.toStrictEqual({ outcome: { kind: 'gone' }, recorded: [] });
    expect(calls).toHaveLength(1);
  });

  it('row 11: a cancelled order is changed, nothing posted', async () => {
    const { calls, pay } = shop([conflict(partial([till10], { status: 'cancelled' }))]);
    await expect(pay()).resolves.toStrictEqual({ outcome: { kind: 'changed', status: 'cancelled', capturedMinor: 1000 }, recorded: [] });
    expect(calls).toHaveLength(1);
  });

  it('row 13: a record 2xx whose re-read is still pos-partial is retry not_completed, never done, with the id recorded', async () => {
    const { calls, pay } = shop([conflict(partial([till10])), recordedAnswer(2), conflict(partial([till10, row(newA, 'captured', '20.00', 'pos_card')]), rev(2))]);
    await expect(pay()).resolves.toStrictEqual({ outcome: { kind: 'retry', reason: 'not_completed' }, recorded: [newA] });
    expect(calls).toHaveLength(3);
  });

  it('row 13: a re-read the store answers 503 is retry, with the id recorded', async () => {
    const { pay } = shop([conflict(partial([till10])), recordedAnswer(2), new Response('', { status: 503 })]);
    await expect(pay()).resolves.toStrictEqual({ outcome: { kind: 'retry', reason: 'status_503' }, recorded: [newA] });
  });

  it('row 14: a failed row under this till\'s id (an earlier over-cover) is refused payment_refused, nothing posted', async () => {
    const { calls, pay } = shop([conflict(partial([till10, row(newA, 'failed', '20.00', 'pos_card')]))]);
    await expect(pay()).resolves.toStrictEqual({ outcome: { kind: 'refused', code: 'payment_refused', message: 'The store refused a payment from this till.' }, recorded: [] });
    expect(calls).toHaveLength(1);
  });

  it('row 15: an authorized row is money in motion: changed, nothing posted', async () => {
    const { calls, pay } = shop([conflict(partial([till10, row('019abcde-0000-7000-8000-0000000000cc', 'authorized', '20.00', 'pos_card')]))]);
    await expect(pay()).resolves.toStrictEqual({ outcome: { kind: 'changed', status: 'pos-partial', capturedMinor: 1000 }, recorded: [] });
    expect(calls).toHaveLength(1);
  });

  it.each<[string, Row, unknown]>([
    ['another currency', partial([{ ...till10, currency: 'EUR' }], { currency: 'EUR' }), { kind: 'refused', code: 'currency_mismatch' }],
    ['a total that does not parse', partial([till10], { total: 'x' }), { kind: 'retry', reason: 'bad_body' }],
    ['another order id', partial([till10], { id: 99 }), { kind: 'refused', code: 'order_mismatch' }],
    ['an unreadable ledger', order({ status: 'pos-partial', total: '30.00' }, [ledger([], 2)]), { kind: 'refused', code: 'ledger_unreadable' }],
  ])('fails closed on %s, nothing posted', async (_name, current, outcome) => {
    const { calls, pay } = shop([conflict(current)]);
    await expect(pay()).resolves.toMatchObject({ outcome, recorded: [] });
    expect(calls).toHaveLength(1);
  });

  it('a read the store accepts is refused read_accepted, nothing posted', async () => {
    const { calls, pay } = shop([json(200, { document: order(), currentRevision: rev(2) })]);
    await expect(pay()).resolves.toMatchObject({ outcome: { kind: 'refused', code: 'read_accepted' }, recorded: [] });
    expect(calls).toHaveLength(1);
  });

  it('a pending order with nothing captured and the whole total due is sent', async () => {
    const legs: Leg[] = [{ id: newA, method: 'external', amountMinor: 3000 }];
    const { records, pay } = shop([conflict(order({ total: '30.00' })), recordedAnswer(2), conflict(paid([row(newA, 'captured', '30.00', 'pos_card')]), rev(2))], legs);
    await expect(pay()).resolves.toMatchObject({ outcome: { kind: 'done' }, recorded: [newA] });
    expect(records()).toHaveLength(1);
  });
});
