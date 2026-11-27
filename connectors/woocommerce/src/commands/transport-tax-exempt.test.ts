import { expect, it, vi } from 'vitest';
import type { OrderCreateEnvelope } from '@tallyui/core';
import { createWooCommandTransport } from '../index';
import fixture from '../__tests__/fixtures/tax-exempt-probe-2026-11-27/probe.json';
import { probeEnvelope } from './tax-exempt-probe-envelopes';

it('X11 refuses only the exempt order in a batch, without pushing its id', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ document: { id: 115, number: '115', total: '3.000000' } }), { status: 201 }));
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
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toMatchObject({ mutationId: ordinary.id, recordId: ordinary.payload.clientOrderId });
});

it('X20 refuses exemption before an unsupported coupon without making a request', async () => {
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
    { id: exempt.id, status: 'rejected', error: { code: 'invalid_payload', data: { storeCode: 'tax_exempt_unsupported' } } },
  ] });
  expect(fetch).not.toHaveBeenCalled();
});

const e1 = fixture.completed.E1;
const exemptSale = () => probeEnvelope('E1', e1.request, fixture.ledger.E1.paymentRequest.payment.id);
const baseUrl = 'https://shop.example/wp-json/wcpos/v2';

it.each([
  ['B1', true, false, 'tax_exempt_inclusive', "This store's prices include tax; WooCommerce tax exemption is only carried where prices exclude it. Complete the sale without it."],
  ['B2', false, true, 'tax_exempt_coupons', 'WooCommerce tax exemption is not carried with coupons on this store. Remove the coupons, or complete the sale without exemption.'],
  ['B3', false, false, 'tax_exempt_coupons', 'WooCommerce tax exemption is not carried with coupons on this store. Remove the coupons, or complete the sale without exemption.'],
] as const)('%s refuses locally with the exemption-specific reason', async (_row, inclusive, acceptsCoupons, storeCode, message) => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  const transport = createWooCommandTransport({ baseUrl, fetch, acceptsTaxExempt: true, acceptsCoupons, getHeaders: () => ({}) });
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

it('B4 reads the exemption option again on the next send', async () => {
  let open = false;
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json(e1.pushResponse, { status: e1.pushStatus }));
  const transport = createWooCommandTransport({ baseUrl, fetch, ledgerPayments: false, acceptsTaxExempt: () => open, getHeaders: () => ({}) });
  const sale = exemptSale();
  expect(await transport.send([sale])).toMatchObject({ kind: 'results', results: [{ status: 'rejected',
    error: { code: 'invalid_payload', data: { storeCode: 'tax_exempt_unsupported' } } }] });
  expect(fetch).not.toHaveBeenCalled();
  open = true;
  expect(await transport.send([sale])).toStrictEqual({ kind: 'results', results: [{ id: sale.id, status: 'applied',
    serverRefs: { orderId: '16', displayId: '16', totalMinor: 1900 } }] });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toStrictEqual(e1.request);
});

it('B5 places exemption after uuid and before split payments', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json(e1.pushResponse, { status: e1.pushStatus }));
  const transport = createWooCommandTransport({ baseUrl, fetch, ledgerPayments: false, acceptsTaxExempt: true, acceptsPaymentsList: true, getHeaders: () => ({}) });
  const sale = exemptSale();
  sale.payload.payments = [{ clientPaymentId: 'cash', method: 'cash', amountMinor: 1000 }, { clientPaymentId: 'card', method: 'external', amountMinor: 900 }];
  expect(await transport.send([sale])).toMatchObject({ kind: 'results', results: [{ status: 'applied' }] });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).payload.meta_data).toStrictEqual([
    ...e1.request.payload.meta_data, { key: '_woocommerce_pos_payments', value: JSON.stringify([
      { method: 'pos_cash', title: 'Cash', amount: '10.00' }, { method: 'pos_card', title: 'Card', amount: '9.00' },
    ]) },
  ]);
});
