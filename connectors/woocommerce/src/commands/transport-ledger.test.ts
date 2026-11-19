import { describe, expect, it, vi } from 'vitest';
import type { OrderCreateEnvelope } from '@tallyui/core';
import { createWooCommandTransport, toWooOrderPayload } from '../index';

const baseUrl = 'https://shop.example/wp-json/wcpos/v2';
const uuid = (n: number) => `019965af-0000-7000-8000-00000000000${n}`;
type Payment = OrderCreateEnvelope['payload']['payments'][number];
function order(payments: Payment[] = [{ clientPaymentId: uuid(5), method: 'cash', amountMinor: 300, tenderedMinor: 500, changeMinor: 200 }], totalMinor = 300): OrderCreateEnvelope {
  return { id: uuid(1), type: 'order.create', version: 1, createdAt: '2026-10-06T10:00:00.000Z', deviceId: uuid(2), attempt: 1,
    payload: { clientOrderId: uuid(3), createdAt: '2026-10-06T10:00:00.000Z', currency: 'EUR', pricesIncludeTax: false,
      subtotalMinor: totalMinor, taxMinor: 0, totalMinor, payments,
      lines: [{ clientLineId: uuid(4), variantId: '80', quantity: 1, unitPriceMinor: totalMinor }] } };
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
// Answers as the v2.0.4 plugin and its tests do: push { document, currentRevision } (Write_Controller.php:767-783), a money
// call without revision 428 and a close without a uuid command_id 400 (Money_Command.php:71-77), an old revision 409
// wcpos_revision_stale with data.currentRevision (Command_Log.php:251-273), else 200 with the next top-level revision
// (Payments_Controller.php:376-405; Test_Payments_Controller.php:85-101,865-902). `queue` overrides answers per path.
function store({ version = '2.0.4' as unknown, ledgerPayments = undefined as boolean | undefined, total = '3.000000', queue = {} as Record<string, Response[]> } = {}) {
  let revision = 1;
  const calls: Array<{ path: string; body?: ReturnType<typeof JSON.parse> }> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    const path = String(url).slice(baseUrl.length + 1), body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, body });
    const queued = queue[path]?.shift();
    if (queued) return queued;
    if (path === 'site') return json(200, { wcpos_version: version });
    if (path === 'push/orders') return json(201, { document: { id: 115, number: '115', total }, currentRevision: `r${revision}` });
    if (typeof body?.revision !== 'string' || !body.revision) return json(428, { code: 'wcpos_revision_required' });
    if (path.endsWith('/close') && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.command_id)) return json(400, { code: 'rest_invalid_param' });
    if (body.revision !== `r${revision}`) return json(409, { code: 'wcpos_revision_stale', data: { status: 409, currentRevision: `r${revision}` } });
    revision += 1;
    return json(200, { payment: { id: body.payment?.id, status: 'captured' }, revision: `r${revision}` });
  });
  const transport = createWooCommandTransport({ baseUrl, fetch, getHeaders: () => ({ 'X-WCPOS': '1' }), acceptsPaymentsList: true,
    ...(ledgerPayments === undefined ? {} : { ledgerPayments }) });
  return { calls, fetch, transport };
}
const applied = { kind: 'results', results: [{ id: uuid(1), status: 'applied', serverRefs: { orderId: '115', displayId: '115', totalMinor: 300 } }] };
const line = { product_id: 80, quantity: 1, subtotal: '3.00', total: '3.00' };
const split: Payment[] = [{ clientPaymentId: uuid(5), method: 'cash', amountMinor: 100, tenderedMinor: 200, changeMinor: 100 },
  { clientPaymentId: uuid(6), method: 'external', amountMinor: 200 }];

describe('WCPOS 2.0 payment ledger', () => {
  it('ledger push sends status pending and no set_paid, payment_method, payment_method_title or _woocommerce_pos_payments', async () => {
    const { calls, transport } = store({ ledgerPayments: true });
    await transport.send([order(split)]);
    expect(calls[0].body.payload).toEqual({ status: 'pending', currency: 'EUR', line_items: [line], meta_data: [{ key: '_woocommerce_pos_uuid', value: uuid(3) }] });
  });
  it('legacy (1.10.x) cash and split bodies are unchanged', async () => {
    const { calls, transport } = store({ ledgerPayments: false });
    expect(await transport.send([order()])).toEqual(applied);
    expect(calls[0].body.payload).toEqual({ status: 'completed', set_paid: true, currency: 'EUR', payment_method: 'pos_cash',
      payment_method_title: 'Cash', line_items: [line], meta_data: [{ key: '_woocommerce_pos_uuid', value: uuid(3) }] });
    expect(toWooOrderPayload(order(split), undefined, { paymentsList: true })).toEqual({ payload: { status: 'completed', set_paid: true,
      currency: 'EUR', payment_method: 'pos_card', payment_method_title: 'Card', line_items: [line], meta_data: [
        { key: '_woocommerce_pos_uuid', value: uuid(3) }, { key: '_woocommerce_pos_payments', value:
          '[{"method":"pos_cash","title":"Cash","amount":"1.00","tendered":"2.00","change":"1.00"},{"method":"pos_card","title":"Card","amount":"2.00"}]' }] } });
    expect(calls).toHaveLength(1);
  });
  it('ledger cash sale records one row with method_id pos_cash, amount and tendered, revision from currentRevision; applied after the record', async () => {
    const { calls, transport } = store({ ledgerPayments: true });
    expect(await transport.send([order()])).toEqual(applied);
    expect(calls.slice(1)).toEqual([{ path: 'orders/115/payments', body: {
      payment: { id: uuid(5), method_id: 'pos_cash', amount: '3.00', currency: 'EUR', tendered: '5.00' }, revision: 'r1' } }]);
  });
  it('card sale records method_id pos_card', async () => {
    const { calls, transport } = store({ ledgerPayments: true });
    expect(await transport.send([order([{ clientPaymentId: uuid(5), method: 'external', amountMinor: 300 }])])).toEqual(applied);
    expect(calls[1].body).toEqual({ payment: { id: uuid(5), method_id: 'pos_card', amount: '3.00', currency: 'EUR' }, revision: 'r1' });
  });
  it('split sale records two rows; the second carries the revision from the first answer', async () => {
    const { calls, transport } = store({ ledgerPayments: true });
    expect(await transport.send([order(split)])).toEqual(applied);
    expect(calls.map(({ path, body }) => [path, body.payment?.id, body.payment?.method_id, body.revision])).toEqual([
      ['push/orders', undefined, undefined, undefined], ['orders/115/payments', uuid(5), 'pos_cash', 'r1'], ['orders/115/payments', uuid(6), 'pos_card', 'r2']]);
  });
  it('zero-total sale calls close with a UUIDv8 command_id derived from the envelope id and the push revision; no record', async () => {
    const { calls, transport } = store({ ledgerPayments: true, total: '0.00' });
    const result = await transport.send([order([{ clientPaymentId: uuid(5), method: 'cash', amountMinor: 0 }], 0)]);
    expect(result).toMatchObject({ results: [{ status: 'applied', serverRefs: { totalMinor: 0 } }] });
    expect(calls.slice(1)).toEqual([{ path: 'orders/115/close', body: { command_id: '019965af-0000-8000-8000-000000000001', revision: 'r1' } }]);
  });
  it('record 409 wcpos_revision_stale resends the identical body with data.currentRevision once; a second stale is retry', async () => {
    const stale = () => json(409, { code: 'wcpos_revision_stale', data: { status: 409, currentRevision: 'r1' } });
    const first = store({ ledgerPayments: true, queue: { 'orders/115/payments': [stale()] } });
    expect(await first.transport.send([order()])).toEqual(applied);
    expect(first.calls[2].body).toEqual({ ...first.calls[1].body, revision: 'r1' });
    const twice = store({ ledgerPayments: true, queue: { 'orders/115/payments': [stale(), stale()] } });
    expect(await twice.transport.send([order()])).toEqual({ kind: 'retry', reason: 'wcpos_revision_stale' });
    expect(twice.calls).toHaveLength(3);
  });
  it('record 5xx after an applied push is retry; the resend replays push with the same mutationId and record with the same payment.id and body', async () => {
    const { calls, transport } = store({ ledgerPayments: true, queue: { 'orders/115/payments': [json(503, {}, { 'Retry-After': '2' })] } });
    expect(await transport.send([order()])).toEqual({ kind: 'retry', reason: 'status_503', retryAfterMs: 2000 });
    expect(await transport.send([order()])).toEqual(applied);
    expect(calls.map(({ path }) => path)).toEqual(['push/orders', 'orders/115/payments', 'push/orders', 'orders/115/payments']);
    expect([calls[2].body, calls[3].body]).toEqual([calls[0].body, calls[1].body]);
    expect(calls[0].body.mutationId).toBe(uuid(1));
  });
  it('non-UUID clientPaymentId is rejected before any request', async () => {
    const { fetch, transport } = store({ ledgerPayments: true });
    const results = [await transport.send([order([{ clientPaymentId: 'cash-1', method: 'cash', amountMinor: 300 }])]),
      await transport.send([order([...split, { clientPaymentId: uuid(7), method: 'external', amountMinor: 0 }])])];
    expect(results).toMatchObject([{ results: [{ status: 'rejected', error: { code: 'invalid_payload' } }] },
      { results: [{ status: 'rejected', error: { code: 'invalid_payload' } }] }]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('record 422 wcpos_command_conflict is rejected invalid_payload naming the store order; 400 wcpos_insufficient_stock is insufficient_stock', async () => {
    const { transport } = store({ ledgerPayments: true, queue: { 'orders/115/payments': [
      json(422, { code: 'wcpos_command_conflict', message: 'Conflict.' }), json(400, { code: 'wcpos_insufficient_stock', message: 'Out.' })] } });
    expect(await transport.send([order()])).toEqual({ kind: 'results', results: [{ id: uuid(1), status: 'rejected', error: { code: 'invalid_payload',
      message: 'WooCommerce order #115 was created but not paid: Conflict.', data: { orderId: '115', storeCode: 'wcpos_command_conflict' } } }] });
    expect(await transport.send([order()])).toMatchObject({ results: [{ status: 'rejected', error: { code: 'insufficient_stock' } }] });
  });
  it('push 426 wcpos_update_required is refused, another 426 is retried', async () => {
    const { transport } = store({ ledgerPayments: true, queue: { 'push/orders': [
      json(426, { code: 'wcpos_update_required', message: 'This store requires a newer version of WCPOS.' }), json(426, {})] } });
    expect(await transport.send([order()])).toEqual({ kind: 'refused', status: 426, reason: 'This store requires a newer version of WCPOS.' });
    expect(await transport.send([order()])).toEqual({ kind: 'retry', reason: 'status_426' });
  });
  it('ledgerPayments absent: /site 2.0.4 selects ledger, 1.10.20 legacy, unreadable /site is retry with no push; /site read once per transport', async () => {
    const ledger = store({ queue: { site: [json(500, {})] } });
    expect(await ledger.transport.send([order()])).toEqual({ kind: 'retry', reason: 'store_version_unknown' });
    expect(await ledger.transport.send([order()])).toEqual(applied);
    expect(await ledger.transport.send([order()])).toEqual(applied);
    expect(ledger.calls.map(({ path }) => path)).toEqual(['site', 'site', 'push/orders', 'orders/115/payments', 'push/orders', 'orders/115/payments']);
    const legacy = store({ version: '1.10.20' });
    expect(await legacy.transport.send([order()])).toEqual(applied);
    expect(legacy.calls.map(({ path, body }) => [path, body?.payload?.status])).toEqual([['site', undefined], ['push/orders', 'completed']]);
    const missing = store({ version: null });
    expect(await missing.transport.send([order()])).toEqual({ kind: 'retry', reason: 'store_version_unknown' });
    expect(missing.calls.map(({ path }) => path)).toEqual(['site']);
  });
  it('push 422 wcpos_status_not_pushable surfaces as rejected with the server message', async () => {
    const { calls, transport } = store({ ledgerPayments: true, queue: { 'push/orders': [json(422, { code: 'wcpos_status_not_pushable', message: 'Not pushable.' })] } });
    expect(await transport.send([order()])).toEqual({ kind: 'results', results: [{ id: uuid(1), status: 'rejected', error: { code: 'invalid_payload', message: 'Not pushable.' } }] });
    expect(calls).toHaveLength(1);
  });
});
