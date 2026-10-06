import { describe, expect, it, vi } from 'vitest';
import type { OrderCreateEnvelope } from '@tallyui/core';
import { createWooCommandTransport, toWooOrderPayload } from '../index';
import { wooMinorFromDecimal } from './transport';

const baseUrl = 'https://shop.example/wp-json/wcpos/v2';
function order(): OrderCreateEnvelope {
  return {
    id: '019965af-0000-7000-8000-000000000001', type: 'order.create', version: 1,
    createdAt: '2026-10-06T10:00:00.000Z', deviceId: '019965af-0000-7000-8000-000000000002', attempt: 1,
    payload: {
      clientOrderId: '019965af-0000-7000-8000-000000000003', createdAt: '2026-10-06T10:00:00.000Z',
      currency: 'EUR', pricesIncludeTax: false, subtotalMinor: 300, taxMinor: 0, totalMinor: 300,
      lines: [{ clientLineId: '019965af-0000-7000-8000-000000000004', variantId: '80', quantity: 1, unitPriceMinor: 300 }],
      payments: [{ clientPaymentId: '019965af-0000-7000-8000-000000000005', method: 'cash', amountMinor: 300 }],
    },
  };
}
function response(status = 201, body: unknown = { document: { id: 115, number: '115', total: '3.000000' } }, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}
function setup(...answers: Array<Response | Error>) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const answer of answers) {
    if (answer instanceof Error) fetch.mockRejectedValueOnce(answer);
    else fetch.mockResolvedValueOnce(answer);
  }
  return { fetch, transport: createWooCommandTransport({ baseUrl, fetch,
    getHeaders: async () => ({ Authorization: 'Bearer token', 'X-WCPOS': '1' }),
  }) };
}

describe('wooMinorFromDecimal', () => {
  it.each([
    ['3.000000', 'EUR', 300], ['3.3', 'EUR', 330], ['3.005000', 'EUR', 301], ['abc', 'EUR', undefined],
    ['3.000000', 'JPY', 3], ['3.123000', 'KWD', 3123], ['', 'EUR', undefined],
  ])('parses %s in %s as %s', (text, currency, expected) => {
    expect(wooMinorFromDecimal(text, currency)).toBe(expected);
  });
});

describe('createWooCommandTransport', () => {
  it('removes every trailing slash from the base URL', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(response());
    const transport = createWooCommandTransport({
      baseUrl: 'https://shop.test/wp-json/wcpos/v2//', getHeaders: () => ({}), fetch,
    });
    await transport.send([order()]);
    expect(fetch).toHaveBeenCalledWith(
      'https://shop.test/wp-json/wcpos/v2/push/orders', expect.objectContaining({ method: 'POST' }),
    );
  });

  it('posts the paid cash spike envelope and returns the authoritative order without warnings', async () => {
    const envelope = order();
    const { transport, fetch } = setup(response());
    expect(await transport.send([envelope])).toEqual({ kind: 'results', results: [{
      id: envelope.id, status: 'applied', serverRefs: { orderId: '115', displayId: '115', totalMinor: 300 },
    }] });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/push/orders`);
    expect(init).toMatchObject({ method: 'POST', headers: {
      'Content-Type': 'application/json', Authorization: 'Bearer token', 'X-WCPOS': '1',
    }, signal: expect.any(AbortSignal) });
    expect(JSON.parse(init!.body as string)).toEqual({
      mutationId: envelope.id, operation: 'create', collection: 'orders', recordId: envelope.payload.clientOrderId,
      baseRevision: null, payload: {
        status: 'completed', set_paid: true, currency: 'EUR', payment_method: 'pos_cash', payment_method_title: 'Cash',
        line_items: [{ product_id: 80, quantity: 1, subtotal: '3.00', total: '3.00' }],
        meta_data: [{ key: '_woocommerce_pos_uuid', value: envelope.payload.clientOrderId }],
      },
    });
  });

  it('keeps the till price and subtracts the line discount', () => {
    const envelope = order();
    Object.assign(envelope.payload.lines[0], { unitPriceMinor: 500, quantity: 2, discountMinor: 100 });
    expect(toWooOrderPayload(envelope)).toMatchObject({ payload: {
      line_items: [{ product_id: 80, quantity: 2, subtotal: '10.00', total: '9.00' }],
    } });
  });

  it('maps card payment and customer fields', () => {
    const envelope = order();
    envelope.payload.payments[0].method = 'external';
    envelope.payload.customer = { customerId: '42', email: 'cashier@example.com' };
    expect(toWooOrderPayload(envelope)).toMatchObject({ payload: {
      payment_method: 'pos_card', payment_method_title: 'Card', customer_id: 42, billing: { email: 'cashier@example.com' },
    } });
    envelope.payload.customer.customerId = 'abc';
    expect(toWooOrderPayload(envelope)).not.toMatchObject({ payload: { customer_id: expect.anything() } });
  });

  it('uses the display exponent for line amounts', () => {
    const envelope = order();
    envelope.payload.display = { currency: 'EUR', exponent: 3, taxInclusive: false, subtotalMinor: 300,
      discountMinor: 0, taxMinor: 0, totalMinor: 300, orderDiscountMinor: 0, lines: [],
    };
    expect(toWooOrderPayload(envelope)).toMatchObject({ payload: { line_items: [{ subtotal: '0.300', total: '0.300' }] } });
  });

  it('warns when the server total differs, including rounded sub-minor totals', async () => {
    for (const [total, serverMinor] of [['3.300000', 330], ['3.005000', 301]] as const) {
      const { transport } = setup(response(200, { document: { id: 115, total } }));
      expect(await transport.send([order()])).toEqual({ kind: 'results', results: [{
        id: order().id, status: 'applied', serverRefs: { orderId: '115', displayId: '115', totalMinor: serverMinor },
        warnings: [{ code: 'total_mismatch', expectedMinor: 300, serverMinor }],
      }] });
    }
  });

  it.each(['order tax', 'line tax', 'two payments', 'no payment', 'bad product'])(
    'rejects %s locally and continues to the next command', async (invalid) => {
      const envelope = order();
      if (invalid === 'order tax') envelope.payload.pricesIncludeTax = true;
      if (invalid === 'line tax') envelope.payload.lines[0].taxInclusive = true;
      if (invalid === 'two payments') envelope.payload.payments.push({ ...envelope.payload.payments[0] });
      if (invalid === 'no payment') envelope.payload.payments = [];
      if (invalid === 'bad product') envelope.payload.lines[0].variantId = 'abc';
      const next = order();
      next.id = '019965af-0000-7000-8000-000000000006';
      const { transport, fetch } = setup(response());
      expect(await transport.send([envelope, next])).toMatchObject({ kind: 'results', results: [
        { id: envelope.id, status: 'rejected', error: {
          code: invalid.includes('tax') ? 'unsupported_tax_mode' : 'invalid_payload',
          message: invalid.includes('tax') ? 'Prices that include tax are not supported for WooCommerce yet.'
            : invalid === 'bad product' ? `Line ${envelope.payload.lines[0].clientLineId} has no WooCommerce product id.`
              : 'WooCommerce orders take one payment.',
        } },
        { id: next.id, status: 'applied' },
      ] });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).mutationId).toBe(next.id);
    },
  );

  it.each([
    [400, { code: 'wcpos_insufficient_stock', message: 'No stock' }, 'insufficient_stock', 'No stock'],
    [400, { code: 'woo_rxdb_sync_bad_envelope' }, 'invalid_payload', 'status_400'],
    [422, { message: 'UUID mismatch' }, 'invalid_payload', 'UUID mismatch'],
  ])('maps rejection %s %o', async (status, body, code, message) => {
    const { transport } = setup(response(status, body));
    expect(await transport.send([order()])).toEqual({ kind: 'results', results: [{
      id: order().id, status: 'rejected', error: { code, message },
    }] });
  });

  it('returns unauthorized for the first command', async () => {
    const { transport } = setup(response(401));
    expect(await transport.send([order()])).toEqual({ kind: 'unauthorized' });
  });

  it.each([401, 503])('returns only earlier results when the second command answers %s', async (status) => {
    const first = order();
    const second = order();
    second.id = '019965af-0000-7000-8000-000000000006';
    second.payload.clientOrderId = '019965af-0000-7000-8000-000000000007';
    const { transport, fetch } = setup(response(), response(status, {}, { 'Retry-After': '5' }));
    expect(await transport.send([first, second])).toEqual({ kind: 'results', results: [{
      id: first.id, status: 'applied', serverRefs: { orderId: '115', displayId: '115', totalMinor: 300 },
    }] });
    expect(fetch.mock.calls.map(([, init]) => JSON.parse(init!.body as string).mutationId)).toEqual([first.id, second.id]);
  });

  it.each([404, 409, 429, 503])('retries status %s with Retry-After', async (status) => {
    const { transport } = setup(response(status, {}, { 'Retry-After': '5' }));
    expect(await transport.send([order()])).toEqual({ kind: 'retry', reason: `status_${status}`, retryAfterMs: 5000 });
  });

  it('retries a rejected fetch as network', async () => {
    const { transport } = setup(new TypeError('Failed to fetch'));
    expect(await transport.send([order()])).toEqual({ kind: 'retry', reason: 'network' });
  });

  it.each([
    [403, { message: 'Forbidden', code: 'forbidden' }, 'Forbidden'],
    [413, { code: 'too_large' }, 'too_large'], [415, {}, 'status_415'],
  ])('refuses status %s', async (status, body, reason) => {
    const { transport } = setup(response(status, body));
    expect(await transport.send([order()])).toEqual({ kind: 'refused', status, reason });
  });

  it.each([{}, { document: { id: 115, total: 'abc' } }, { document: { total: '3.00' } }])(
    'retries an unusable success body %o', async (body) => {
      const { transport } = setup(response(201, body));
      expect(await transport.send([order()])).toEqual({ kind: 'retry', reason: 'bad_body' });
    },
  );

  it('retries malformed JSON as bad_body', async () => {
    const { transport } = setup(new Response('not json', { status: 201 }));
    expect(await transport.send([order()])).toEqual({ kind: 'retry', reason: 'bad_body' });
  });

  it('aborts a request at its timeout', async () => {
    vi.useFakeTimers();
    try {
      const fetch = vi.fn<typeof globalThis.fetch>((_url, init) => new Promise((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => reject(new Error('aborted')));
      }));
      const transport = createWooCommandTransport({ baseUrl, getHeaders: () => ({}), fetch, timeoutMs: 20 });
      const sending = transport.send([order()]);
      await vi.advanceTimersByTimeAsync(20);
      expect(await sending).toEqual({ kind: 'retry', reason: 'timeout' });
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});
