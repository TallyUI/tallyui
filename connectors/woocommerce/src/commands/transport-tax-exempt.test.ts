import { expect, it, vi } from 'vitest';
import type { OrderCreateEnvelope } from '@tallyui/core';
import { createWooCommandTransport } from '../index';
import { readWooCapabilities } from '../store-settings';
import stores from '../__tests__/fixtures/taxes-1.10.20/stores.json';
import fixture from '../__tests__/fixtures/tax-exempt-probe-2026-11-27/probe.json';
import { probeEnvelope } from './tax-exempt-probe-envelopes';

it('G4 refuses only the exempt order in a batch, without pushing its id', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json({})).mockResolvedValueOnce(Response.json({ wcpos_version: '1.10.19' }))
    .mockResolvedValueOnce(Response.json({ document: { id: 115, number: '115', total: '3.000000' } }, { status: 201 }));
  const transport = createWooCommandTransport({ baseUrl: 'https://shop.example/wp-json/wcpos/v2', fetch, ledgerPayments: false,
    getHeaders: async () => ({ Authorization: 'Bearer token', 'X-WCPOS': '1' }) });
  const createdAt = '2026-10-06T10:00:00.000Z';
  const ordinary: OrderCreateEnvelope = {
    id: '019965af-0000-7000-8000-000000000001', type: 'order.create', version: 1, createdAt, deviceId: 'till', attempt: 1,
    payload: { clientOrderId: '019965af-0000-7000-8000-000000000003', createdAt, currency: 'EUR', pricesIncludeTax: false,
      subtotalMinor: 300, taxMinor: 0, totalMinor: 300, lines: [{ clientLineId: 'line', variantId: '80', quantity: 1, unitPriceMinor: 300 }],
      payments: [{ clientPaymentId: 'payment', method: 'cash', amountMinor: 300 }] },
  };
  const exempt: OrderCreateEnvelope = { ...ordinary, id: '019965af-0000-7000-8000-000000000002',
    payload: { ...ordinary.payload, clientOrderId: '019965af-0000-7000-8000-000000000004', taxExempt: true } };
  expect(await transport.send([exempt, ordinary])).toMatchObject({ kind: 'results', results: [
    { id: exempt.id, status: 'rejected', error: { code: 'invalid_payload', data: { storeCode: 'tax_exempt_unsupported' },
      message: "This store's WooCommerce connector does not carry tax exemption yet; complete the sale without it." } },
    { id: ordinary.id, status: 'applied', serverRefs: { orderId: '115' } },
  ] });
  expect(routes(fetch)).toEqual(['status', 'site', 'push/orders']);
  expect(JSON.parse(fetch.mock.calls[2][1]!.body as string)).toMatchObject({ mutationId: ordinary.id, recordId: ordinary.payload.clientOrderId });
});

it('X20 refuses an exempt sale carrying coupons as tax_exempt_coupons without making a request', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  const transport = createWooCommandTransport({ baseUrl: 'https://shop.example/wp-json/wcpos/v2', fetch, ledgerPayments: false,
    acceptsCoupons: false, getHeaders: () => ({}) });
  const createdAt = '2026-10-06T10:00:00.000Z';
  const exempt: OrderCreateEnvelope = {
    id: '019965af-0000-7000-8000-000000000001', type: 'order.create', version: 6, createdAt, deviceId: 'till', attempt: 1,
    payload: { clientOrderId: '019965af-0000-7000-8000-000000000003', createdAt, currency: 'EUR', pricesIncludeTax: false, taxExempt: true,
      subtotalMinor: 300, taxMinor: 0, totalMinor: 290, lines: [{ clientLineId: 'line', variantId: '80', quantity: 1, unitPriceMinor: 300 }],
      coupons: [{ code: 'ten', couponId: '1', discountMinor: 10, discountTaxMinor: 0 }], payments: [{ clientPaymentId: 'payment', method: 'cash', amountMinor: 290 }] },
  };
  expect(await transport.send([exempt])).toMatchObject({ kind: 'results', results: [
    { id: exempt.id, status: 'rejected', error: { code: 'invalid_payload', data: { storeCode: 'tax_exempt_coupons' } } },
  ] });
  expect(fetch).not.toHaveBeenCalled();
});

const e1 = fixture.completed.E1;
const exemptSale = () => probeEnvelope('E1', e1.request, fixture.ledger.E1.paymentRequest.payment.id);
const baseUrl = 'https://shop.example/wp-json/wcpos/v2';
const getHeaders = () => ({});
const context = { connectorId: 'woocommerce', baseUrl, headers: {}, signal: new AbortController().signal };
const ledger = fixture.ledger.E1;
function store(wcpos_version = '1.10.20', status = () => Response.json({}), inclusive = false) {
  const row = wcpos_version === '2.0.5' ? ledger : e1;
  return vi.fn<typeof globalThis.fetch>(async input => {
    switch (String(input).slice(baseUrl.length + 1)) {
      case 'stores': return Response.json([{ ...stores[0], prices_include_tax: inclusive ? 'yes' : 'no' }]);
      case 'status': return status();
      case 'site': return Response.json({ wcpos_version });
      case 'push/orders': return Response.json(row.pushResponse, { status: row.pushStatus });
      case `orders/${ledger.pushResponse.document.id}/payments`: return Response.json(ledger.paymentResponse, { status: ledger.paymentStatus });
      default: throw new Error(`Unexpected request: ${input}`);
    }
  });
}
const routes = (fetch: ReturnType<typeof store>) => fetch.mock.calls.map(([url]) => String(url).slice(baseUrl.length + 1));

it.each([
  ['A1', {}, '1.10.20', false, true], ['A2', {}, '1.10.19', false, false],
  ['A3', { capabilities: [] }, '2.0.5', false, true], ['A4', { capabilities: [] }, '2.0.4', false, false],
  ['A5', { capabilities: [] }, '2.1.0', false, false], ['A6', { capabilities: ['order_create_v5'] }, '1.10.20', false, false],
  ['A7', {}, '1.10.20', true, false],
] as const)('%s transport agrees with the declaration', async (_row, status, version, inclusive, supported) => {
  const fetch = store(version, () => Response.json(status), inclusive);
  const declared = (await readWooCapabilities({ ...context, fetch }))?.taxExempt === true;
  expect(declared).toBe(supported);
  fetch.mockClear();
  const ledgerPayments = version === '2.0.5';
  const sale = exemptSale();
  sale.payload.pricesIncludeTax = inclusive;
  const outcome = await createWooCommandTransport({ baseUrl, getHeaders, fetch, ledgerPayments }).send([sale]);
  const calls = routes(fetch);
  expect(calls.includes('push/orders')).toBe(declared);
  if (!supported) {
    expect(calls).toEqual(inclusive ? [] : ['status', 'site']);
    expect(outcome).toMatchObject({ kind: 'results', results: [{ status: 'rejected', error: { data: {
      storeCode: inclusive ? 'tax_exempt_inclusive' : 'tax_exempt_unsupported' } } }] });
  } else {
    expect(calls).toEqual(['status', 'site', 'push/orders', ...(ledgerPayments ? [`orders/${ledger.pushResponse.document.id}/payments`] : [])]);
    expect(outcome).toMatchObject({ kind: 'results', results: [{ status: 'applied' }] });
    if (!ledgerPayments) expect(JSON.parse(fetch.mock.calls[2][1]!.body as string)).toStrictEqual(e1.request);
  }
});

it.each([
  ['B1', true, false, 'tax_exempt_inclusive', "This store's prices include tax; WooCommerce tax exemption is only carried where prices exclude it. Complete the sale without it."],
  ['B2', false, true, 'tax_exempt_coupons', 'WooCommerce tax exemption is not carried with coupons on this store. Remove the coupons, or complete the sale without exemption.'],
  ['B3', false, false, 'tax_exempt_coupons', 'WooCommerce tax exemption is not carried with coupons on this store. Remove the coupons, or complete the sale without exemption.'],
] as const)('%s refuses locally with the exemption-specific reason', async (_row, inclusive, acceptsCoupons, storeCode, message) => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  const transport = createWooCommandTransport({ baseUrl, fetch, acceptsCoupons, getHeaders: () => ({}) });
  const sale = exemptSale();
  if (inclusive) sale.payload.pricesIncludeTax = true;
  else {
    sale.version = 6;
    sale.payload.coupons = [{ code: 'ten', couponId: '1', discountMinor: 10, discountTaxMinor: 0 }];
  }
  expect(await transport.send([sale])).toStrictEqual({ kind: 'results', results: [
    { id: sale.id, status: 'rejected', error: { code: 'invalid_payload', data: { storeCode }, message } },
  ] });
  expect(fetch).not.toHaveBeenCalled();
});

it('G1 retries a failed status read and reads again on the next send', async () => {
  const fetch = store().mockResolvedValueOnce(new Response(null, { status: 500 }));
  const transport = createWooCommandTransport({ baseUrl, fetch, ledgerPayments: false, getHeaders });
  const sale = exemptSale();
  expect(await transport.send([sale])).toStrictEqual({ kind: 'retry', reason: 'store_status_unknown' });
  expect(routes(fetch)).toEqual(['status']);
  expect(await transport.send([sale])).toStrictEqual({ kind: 'results', results: [{ id: sale.id, status: 'applied',
    serverRefs: { orderId: '16', displayId: '16', totalMinor: 1900 } }] });
  expect(routes(fetch)).toEqual(['status', 'status', 'site', 'push/orders']);
  expect(JSON.parse(fetch.mock.calls[3][1]!.body as string)).toStrictEqual(e1.request);
});

it('B5 places exemption after uuid and before split payments', async () => {
  const fetch = store();
  const transport = createWooCommandTransport({ baseUrl, fetch, ledgerPayments: false, acceptsPaymentsList: true, getHeaders: () => ({}) });
  const sale = exemptSale();
  sale.payload.payments = [{ clientPaymentId: 'cash', method: 'cash', amountMinor: 1000 }, { clientPaymentId: 'card', method: 'external', amountMinor: 900 }];
  expect(await transport.send([sale])).toMatchObject({ kind: 'results', results: [{ status: 'applied' }] });
  expect(routes(fetch)).toEqual(['status', 'site', 'push/orders']);
  expect(JSON.parse(fetch.mock.calls[2][1]!.body as string).payload.meta_data).toStrictEqual([
    ...e1.request.payload.meta_data, { key: '_woocommerce_pos_payments', value: JSON.stringify([
      { method: 'pos_cash', title: 'Cash', amount: '10.00' }, { method: 'pos_card', title: 'Card', amount: '9.00' },
    ]) },
  ]);
});

it('G7 preserves the inclusive refusal when the next exempt sale’s /status returns 401', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json({ code: 'rest_forbidden' }, { status: 401 }));
  const transport = createWooCommandTransport({ baseUrl, fetch, getHeaders: () => ({}) });
  const exempt = exemptSale();
  exempt.payload.pricesIncludeTax = true;
  expect(await transport.send([exempt, exemptSale()])).toStrictEqual({ kind: 'results', results: [
    { id: exempt.id, status: 'rejected', error: { code: 'invalid_payload', data: { storeCode: 'tax_exempt_inclusive' },
      message: "This store's prices include tax; WooCommerce tax exemption is only carried where prices exclude it. Complete the sale without it." } },
  ] });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(`${baseUrl}/status`, expect.objectContaining({ method: 'GET' }));
});

it('G2 returns unauthorized for status 401', async () => {
  const fetch = store().mockResolvedValueOnce(new Response(null, { status: 401 }));
  expect(await createWooCommandTransport({ baseUrl, fetch, getHeaders }).send([exemptSale()])).toStrictEqual({ kind: 'unauthorized' });
  expect(routes(fetch)).toEqual(['status']);
});

it('G3 retries a failed site read', async () => {
  const fetch = store().mockResolvedValueOnce(Response.json({})).mockResolvedValueOnce(new Response(null, { status: 500 }));
  expect(await createWooCommandTransport({ baseUrl, fetch, getHeaders }).send([exemptSale()])).toStrictEqual({ kind: 'retry', reason: 'store_version_unknown' });
  expect(routes(fetch)).toEqual(['status', 'site']);
});

it('G6 reads the gate once per send, not once per exempt sale', async () => {
  const fetch = store();
  const transport = createWooCommandTransport({ baseUrl, fetch, getHeaders, ledgerPayments: false });
  const second = probeEnvelope('E1', fixture.completed.E2.request, fixture.ledger.E2.paymentRequest.payment.id);
  expect(await transport.send([exemptSale(), second])).toMatchObject({ kind: 'results', results: [{ status: 'applied' }, { id: second.id, status: 'applied' }] });
  expect(routes(fetch)).toEqual(['status', 'site', 'push/orders', 'push/orders']);
  fetch.mockClear();
  expect(await transport.send([exemptSale()])).toMatchObject({ kind: 'results', results: [{ status: 'applied' }] });
  expect(routes(fetch)).toEqual(['status', 'site', 'push/orders']);
});

it('G8 reads site independently for the gate and the payment ledger', async () => {
  const fetch = store('2.0.5', () => Response.json({ capabilities: [] }));
  expect(await createWooCommandTransport({ baseUrl, fetch, getHeaders }).send([exemptSale()])).toMatchObject({ kind: 'results', results: [{ status: 'applied' }] });
  expect(routes(fetch)).toEqual(['status', 'site', 'site', 'push/orders', `orders/${ledger.pushResponse.document.id}/payments`]);
});

it('G9 does not declare exemption or refuse the sale when status JSON cannot be read', async () => {
  const fetch = store('1.10.20', () => new Response('oops'));
  expect(await readWooCapabilities({ ...context, fetch })).not.toHaveProperty('taxExempt');
  fetch.mockClear();
  expect(await createWooCommandTransport({ baseUrl, fetch, getHeaders }).send([exemptSale()])).toStrictEqual({ kind: 'retry', reason: 'store_status_unknown' });
  expect(routes(fetch)).toEqual(['status']);
});

it('T1 exposes no app-wired tax exemption option', () => {
  // @ts-expect-error Exemption is declared by the store, not the app.
  createWooCommandTransport({ baseUrl, getHeaders, acceptsTaxExempt: true });
});
