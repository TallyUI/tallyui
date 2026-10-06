import { describe, expect, it, vi } from 'vitest';
import type { OrderCreateEnvelope } from '@tallyui/core';
import { createWooCommandTransport, toWooOrderPayload } from '../index';
import { wooMinorFromDecimal, type WooLocalOrder } from './transport';

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
  it.each([
    ['USD', undefined, ['2727272700', '909090900'], ['27.272727', '9.090909']],
    ['JPY', undefined, ['1234000000'], ['1234.000000']],
    ['USD', 3, ['1234000000'], ['1.234000']],
    ['USD', undefined, ['0', '100', '900719925474099300'], ['0.000000', '0.000001', '9007199254.740993']],
  ] as const)('pushes stored inclusive nets in %s with exponent %s', async (currency, exponent, nets, expected) => {
    const envelope = order();
    Object.assign(envelope.payload, { currency, pricesIncludeTax: true });
    envelope.payload.lines = nets.map((_, i) => ({ ...envelope.payload.lines[0], clientLineId: `line-${i}` }));
    if (exponent !== undefined) envelope.payload.display = { currency, exponent, taxInclusive: true, subtotalMinor: 300,
      discountMinor: 0, taxMinor: 0, totalMinor: 300, orderDiscountMinor: 0, lines: [] };
    const local = { lines: nets.map((netMicros, i) => ({ id: `line-${i}`, netMicros })).reverse() };
    const { transport, fetch } = setup(response());
    await transport.send([envelope], { local: { orders: new Map([[envelope.id, local]]) } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).payload.line_items).toEqual(expected.map((net) => ({
      product_id: 80, quantity: 1, subtotal: net, total: net,
    })));
  });

  it.each([true, false])('uses line tax mode overrides with order pricesIncludeTax=%s', async (pricesIncludeTax) => {
    const envelope = order();
    envelope.payload.pricesIncludeTax = pricesIncludeTax;
    envelope.payload.lines = [
      { ...envelope.payload.lines[0], taxInclusive: false, discountMinor: 100 },
      { ...envelope.payload.lines[0], clientLineId: 'inclusive', taxInclusive: true },
    ];
    const { transport, fetch } = setup(response());
    await transport.send([envelope], { local: { orders: new Map([[envelope.id, {
      lines: [{ id: 'inclusive', netMicros: '272727300' }],
    }]]) } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).payload.line_items).toEqual([
      { product_id: 80, quantity: 1, subtotal: '3.00', total: '2.00' },
      { product_id: 80, quantity: 1, subtotal: '2.727273', total: '2.727273' },
    ]);
  });

  it.each(['discounted', 'missing order', 'missing line', 'missing net', 'too fine', 'negative'] as const)(
    'refuses an inclusive line with %s without a request', async (kind) => {
      const envelope = order();
      envelope.payload.pricesIncludeTax = true;
      const id = envelope.payload.lines[0].clientLineId;
      if (kind === 'discounted') envelope.payload.lines[0].discountMinor = 1;
      const local: WooLocalOrder = { lines: [{ id: kind === 'missing line' ? 'other' : id,
        netMicros: kind === 'missing net' ? undefined : kind === 'too fine' ? '2727272701'
          : kind === 'negative' ? '-100' : '2727272700' }] };
      const context = kind === 'missing order' ? undefined : { local: { orders: new Map([[envelope.id, local]]) } };
      const code = kind === 'too fine' || kind === 'negative' ? 'invalid_payload' : 'unsupported_tax_mode';
      const message = kind === 'discounted' ? 'Discounted tax-inclusive lines are not supported for WooCommerce yet.'
        : kind === 'too fine' ? `Line ${id} has a net finer than 6 decimals.`
          : kind === 'negative' ? `Line ${id} has a negative net.`
            : "Tax-inclusive prices need the till's WooCommerce tax figures; update the till.";
      const { transport, fetch } = setup();
      expect(await transport.send([envelope], context)).toEqual({ kind: 'results', results: [{
        id: envelope.id, status: 'rejected', error: { code, message },
      }] });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('keeps exclusive request bytes identical with and without local context', async () => {
    const envelope = order();
    const { transport, fetch } = setup(response(), response());
    await transport.send([envelope]);
    await transport.send([envelope], { local: { orders: new Map([[envelope.id, {
      lines: [{ id: envelope.payload.lines[0].clientLineId, netMicros: '2727272700' }],
    }]]) } });
    const bodies = fetch.mock.calls.map(([, init]) => JSON.parse(init!.body as string));
    expect(JSON.stringify(bodies[1])).toBe(JSON.stringify(bodies[0]));
    expect(bodies[1]).toEqual({ mutationId: envelope.id, operation: 'create', collection: 'orders',
      recordId: envelope.payload.clientOrderId, baseRevision: null, payload: {
        status: 'completed', set_paid: true, currency: 'EUR', payment_method: 'pos_cash', payment_method_title: 'Cash',
        line_items: [{ product_id: 80, quantity: 1, subtotal: '3.00', total: '3.00' }],
        meta_data: [{ key: '_woocommerce_pos_uuid', value: envelope.payload.clientOrderId }],
      } });
  });

  it.each([true, () => true, async () => true])('records card and cash with list support %s', async (acceptsPaymentsList) => {
    const envelope = order();
    envelope.payload.totalMinor = envelope.payload.subtotalMinor = envelope.payload.lines[0].unitPriceMinor = 4291;
    envelope.payload.payments = [
      { clientPaymentId: 'card', method: 'external', amountMinor: 3000 },
      { clientPaymentId: 'cash', method: 'cash', amountMinor: 1291, tenderedMinor: 2000, changeMinor: 709 },
    ];
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(response(201, { document: { id: 115, total: '42.91' } }));
    const transport = createWooCommandTransport({ baseUrl, getHeaders: () => ({}), fetch, acceptsPaymentsList });
    expect(await transport.send([envelope])).toMatchObject({ kind: 'results', results: [{ status: 'applied' }] });
    expect(fetch).toHaveBeenCalledTimes(1);
    const { payload } = JSON.parse(fetch.mock.calls[0][1]!.body as string);
    expect(payload.payment_method).toBe('pos_card');
    expect(payload.payment_method_title).toBe('Card');
    expect(payload.meta_data).toEqual([
      { key: '_woocommerce_pos_uuid', value: envelope.payload.clientOrderId },
      { key: '_woocommerce_pos_payments', value: expect.any(String) },
    ]);
    expect(JSON.parse(payload.meta_data[1].value)).toEqual([
      { method: 'pos_card', title: 'Card', amount: '30.00' },
      { method: 'pos_cash', title: 'Cash', amount: '12.91', tendered: '20.00', change: '7.09' },
    ]);
  });

  it.each([[150, 'pos_cash', 'Cash'], [100, 'pos_card', 'Card']] as const)(
    'picks the largest tender, first on a tie, with cash amount %i', (cashMinor, method, title) => {
      const envelope = order();
      envelope.payload.payments = [
        { clientPaymentId: 'cash', method: 'cash', amountMinor: cashMinor, tenderedMinor: cashMinor, changeMinor: 0 },
        { clientPaymentId: 'card', method: 'external', amountMinor: 300 - cashMinor, reference: 'receipt-42' },
      ];
      const mapped = toWooOrderPayload(envelope, undefined, { paymentsList: true });
      expect(mapped).toMatchObject({ payload: { payment_method: method, payment_method_title: title } });
      if (!('payload' in mapped)) throw new Error('Expected an order payload');
      const meta = mapped.payload.meta_data as Array<{ key: string; value: string }>;
      expect(JSON.parse(meta[1].value)).toEqual([
        { method: 'pos_cash', title: 'Cash', amount: (cashMinor / 100).toFixed(2), tendered: (cashMinor / 100).toFixed(2), change: '0.00' },
        { method: 'pos_card', title: 'Card', amount: ((300 - cashMinor) / 100).toFixed(2), reference: 'receipt-42' },
      ]);
    },
  );

  it.each([undefined, false, () => false, async () => false])('refuses split tender without support %s', async (acceptsPaymentsList) => {
    const envelope = order();
    envelope.payload.payments[0].amountMinor = 150;
    envelope.payload.payments.push({ ...envelope.payload.payments[0], clientPaymentId: 'second' });
    const fetch = vi.fn<typeof globalThis.fetch>();
    const transport = createWooCommandTransport({ baseUrl, getHeaders: () => ({}), fetch, acceptsPaymentsList });
    expect(await transport.send([envelope])).toEqual({ kind: 'results', results: [{
      id: envelope.id, status: 'rejected', error: { code: 'invalid_payload', message: 'WooCommerce orders take one payment.' },
    }] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts byte-identical one-payment bodies with list support on and off', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => response());
    for (const acceptsPaymentsList of [undefined, false, true]) {
      const transport = createWooCommandTransport({ baseUrl, getHeaders: () => ({}), fetch, acceptsPaymentsList });
      await transport.send([order()]);
    }
    expect(fetch).toHaveBeenCalledTimes(3);
    const bodies = fetch.mock.calls.map(([, init]) => init!.body);
    expect(bodies[1]).toBe(bodies[0]);
    expect(bodies[2]).toBe(bodies[0]);
    expect(JSON.parse(bodies[0] as string).payload.meta_data).toEqual([
      { key: '_woocommerce_pos_uuid', value: order().payload.clientOrderId },
    ]);
  });

  it.each([
    [0, 'WooCommerce orders take one payment.'],
    [21, 'WooCommerce records at most 20 payments.'],
    [2, 'Payments do not add up to the order total.'],
  ] as const)('refuses %i invalid payments with list support and no request', async (count, message) => {
    const envelope = order();
    envelope.payload.payments = Array.from({ length: count }, (_, i) => ({
      ...envelope.payload.payments[0], clientPaymentId: String(i),
    }));
    const fetch = vi.fn<typeof globalThis.fetch>();
    const transport = createWooCommandTransport({ baseUrl, getHeaders: () => ({}), fetch, acceptsPaymentsList: true });
    expect(await transport.send([envelope])).toEqual({ kind: 'results', results: [{
      id: envelope.id, status: 'rejected', error: { code: 'invalid_payload', message },
    }] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('resolves list support once per send call', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => response());
    const acceptsPaymentsList = vi.fn(async () => true);
    const transport = createWooCommandTransport({ baseUrl, getHeaders: () => ({}), fetch, acceptsPaymentsList });
    await transport.send([order(), order()]);
    expect(acceptsPaymentsList).toHaveBeenCalledTimes(1);
    await transport.send([order()]);
    expect(acceptsPaymentsList).toHaveBeenCalledTimes(2);
  });

  it.each(['fees', 'shipping', 'custom'] as const)('refuses v5 %s as invalid_payload without a request', async (kind) => {
    const envelope = order();
    envelope.version = 5;
    if (kind === 'fees') envelope.payload.fees = [{ clientFeeId: envelope.id, name: 'Bag', amountMinor: 20, taxStatus: 'taxable', taxMinor: 4 }];
    if (kind === 'shipping') envelope.payload.shipping = [{ clientShippingId: envelope.id, name: 'Delivery', amountMinor: 500, taxStatus: 'taxable', taxMinor: 100 }];
    if (kind === 'custom') {
      delete envelope.payload.lines[0].variantId;
      envelope.payload.lines[0].custom = { name: 'Gift wrap', taxStatus: 'none' };
    }
    const { transport, fetch } = setup();
    expect(await transport.send([envelope])).toEqual({ kind: 'results', results: [{ id: envelope.id, status: 'rejected',
      error: { code: 'invalid_payload', message: 'Fees, shipping and custom lines are not supported by this connector yet.' } }] });
    expect(fetch).not.toHaveBeenCalled();
  });

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
          message: invalid.includes('tax') ? "Tax-inclusive prices need the till's WooCommerce tax figures; update the till."
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
