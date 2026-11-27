import { expect, it, vi } from 'vitest';
import type { OrderCreateEnvelope } from '@tallyui/core';
import { createWooCommandTransport } from '../index';

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
