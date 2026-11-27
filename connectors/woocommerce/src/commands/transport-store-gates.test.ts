import { expect, it, vi } from 'vitest';
import type { OrderCreateEnvelope } from '@tallyui/core';
import { readWooCapabilities } from '../store-settings';
import { createWooCommandTransport, type WooCommandTransportOptions } from './transport';

const baseUrl = 'https://shop.example/wp-json/wcpos/v2';
const push = 'push/orders';
type Feature = 'coupons' | 'cashRounding' | 'multiplePayments' | 'ordinary';
function sale(feature: Feature, id: string = feature): OrderCreateEnvelope {
  const createdAt = '2026-10-06T10:00:00.000Z';
  const subtotalMinor = feature === 'coupons' ? 305 : feature === 'cashRounding' ? 295 : 300;
  return { id, type: 'order.create', version: 6, createdAt, deviceId: 'till', attempt: 1,
    payload: { clientOrderId: id, createdAt, currency: 'EUR', pricesIncludeTax: false, subtotalMinor, taxMinor: 0, totalMinor: 300,
      lines: [{ clientLineId: 'line', variantId: '80', quantity: 1, unitPriceMinor: subtotalMinor }],
      ...(feature === 'coupons' ? { coupons: [{ couponId: '1', code: 'five', discountMinor: 5, discountTaxMinor: 0 }] } : {}),
      ...(feature === 'cashRounding' ? { cashRoundings: [{ paymentId: 'cash', minor: 5 }] } : {}),
      payments: feature === 'multiplePayments' ? [{ clientPaymentId: 'cash', method: 'cash', amountMinor: 100 },
        { clientPaymentId: 'card', method: 'external', amountMinor: 200 }] : [{ clientPaymentId: 'cash', method: 'cash', amountMinor: 300 }] } };
}

function store(status: 'stock' | 'fork' | 'list' | number, version: string | number, options: Partial<WooCommandTransportOptions> = {}) {
  const routes: string[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async url => {
    const route = String(url).slice(baseUrl.length + 1);
    routes.push(route);
    switch (route) {
      case 'stores': return Response.json([{ currency: 'EUR', prices_include_tax: 'no' }]);
      case 'status': return typeof status === 'number' ? Response.json({ code: 'rest_forbidden' }, { status })
        : Response.json(status === 'stock' ? {} : { capabilities: [status === 'fork' ? 'order_create_v5' : 'order_payments_list'] });
      case 'site': return typeof version === 'number' ? Response.json({}, { status: version }) : Response.json({ wcpos_version: version });
      case push: return Response.json({ document: { id: 115, number: '115', total: '3.00' } }, { status: 201 });
      default: throw new Error(`Unexpected request: ${url}`);
    }
  });
  const transport = createWooCommandTransport({ baseUrl, fetch, getHeaders: () => ({}), ledgerPayments: false, ...options });
  return { routes, fetch, transport };
}

const result = (status: string, error?: object) => ({ kind: 'results', results: [{ status, ...(error ? { error } : {}) }] });
const sent = result('applied');
const couponClosed = result('rejected', { code: 'coupon_invalid', data: { storeCode: 'coupons_unsupported' } });
const roundingClosed = (ledger = false) => result('rejected', { code: 'invalid_payload', data: { storeCode: 'cash_rounding_unsupported' },
  message: ledger ? 'WooCommerce POS 2.0 does not carry cash rounding; complete the sale without it.'
    : "This store's WooCommerce connector does not carry cash rounding; complete the sale without it." });
const listClosed = result('rejected', { code: 'invalid_payload', message: 'WooCommerce orders take one payment.' });
const retry = (reason: string) => ({ kind: 'retry', reason });
const unauthorized = { kind: 'unauthorized' };

it.each([
  ['C1', '1.9.0', undefined, sent, ['site', push]],
  ['C2', '1.8.9', undefined, couponClosed, ['site']],
  ['C3', 500, undefined, retry('store_version_unknown'), ['site']],
  ['C4', '1.10.20', false, couponClosed, []],
  ['C5', '1.8.9', true, couponClosed, ['site']],
  ['C6', 401, undefined, unauthorized, ['site']],
] as const)('%s coupon gate', async (_row, version, acceptsCoupons, expected, calls) => {
  const { transport, routes } = store('stock', version, { acceptsCoupons });
  expect(await transport.send([sale('coupons')])).toMatchObject(expected);
  expect(routes).toEqual(calls);
});

it.each([
  ['R1', 'fork', '1.10.19', undefined, false, sent, ['status', 'site', push]],
  ['R2', 'stock', '1.10.20', undefined, false, roundingClosed(), ['status', 'site']],
  ['R3', 'fork', '2.0.5', undefined, false, roundingClosed(), ['status', 'site']],
  ['R4', 500, '1.10.20', undefined, false, retry('store_status_unknown'), ['status']],
  ['R5', 'fork', 'x', undefined, false, retry('store_version_unknown'), ['status', 'site']],
  ['R6', 'fork', '2.0.5', undefined, true, roundingClosed(true), []],
  ['R7', 'stock', '1.10.20', true, false, roundingClosed(), ['status', 'site']],
] as const)('%s cash-rounding gate', async (_row, status, version, acceptsCashRounding, ledgerPayments, expected, calls) => {
  const { transport, routes, fetch } = store(status, version, { acceptsCashRounding, ledgerPayments });
  expect(await transport.send([sale('cashRounding')])).toMatchObject(expected);
  expect(routes).toEqual(calls);
  if (expected === sent) expect(JSON.parse(String(fetch.mock.calls.at(-1)![1]!.body)).payload.fee_lines).toEqual([
    { name: 'Rounding', total: '0.05', tax_status: 'none', tax_class: '' },
  ]);
});

it.each([
  ['P1', 'list', undefined, 'multiplePayments', sent, ['status', push]],
  ['P2', 'stock', undefined, 'multiplePayments', listClosed, ['status']],
  ['P3', 403, undefined, 'multiplePayments', unauthorized, ['status']],
  ['P4', 'list', false, 'multiplePayments', listClosed, []],
  ['P5', 'stock', undefined, 'ordinary', sent, [push]],
] as const)('%s split-tender gate', async (_row, status, acceptsPaymentsList, feature, expected, calls) => {
  const { transport, routes, fetch } = store(status, '1.10.20', { acceptsPaymentsList });
  expect(await transport.send([sale(feature)])).toMatchObject(expected);
  expect(routes).toEqual(calls);
  if (feature === 'multiplePayments' && expected === sent) {
    expect(JSON.parse(String(fetch.mock.calls.at(-1)![1]!.body)).payload.meta_data).toContainEqual({ key: '_woocommerce_pos_payments',
      value: JSON.stringify([{ method: 'pos_cash', title: 'Cash', amount: '1.00' }, { method: 'pos_card', title: 'Card', amount: '2.00' }]) });
  }
});

it('B1 reads site and status once across a coupon sale and split tender', async () => {
  const { transport, routes } = store('list', '1.9.0');
  expect(await transport.send([sale('coupons'), sale('multiplePayments')])).toMatchObject({ kind: 'results', results: [
    { id: 'coupons', status: 'applied' }, { id: 'multiplePayments', status: 'applied' },
  ] });
  expect(routes).toEqual(['site', push, 'status', push]);
});

it.each([
  ['stock', '1.8.9'], ['stock', '1.9.0'], ['stock', '1.10.20'], ['stock', '2.0.5'],
  ['fork', '1.10.19'], ['fork', '2.0.5'], ['list', '1.10.20'], [500, '1.10.20'],
] as const)('declaration and push agree for %s / %s', async (status, version) => {
  const { transport, fetch, routes } = store(status, version);
  const declaration = await readWooCapabilities({ baseUrl, fetch, headers: {}, connectorId: 'woocommerce' });
  expect(routes).toEqual(['stores', 'status', 'site']);
  expect(declaration).toBeDefined();
  for (const [feature, closed] of [['coupons', couponClosed], ['cashRounding', roundingClosed()], ['multiplePayments', listClosed]] as const) {
    const start = routes.length, declared = declaration![feature] === true;
    expect(await transport.send([sale(feature)])).toMatchObject(declared ? sent
      : status === 500 && feature !== 'coupons' ? retry('store_status_unknown') : closed);
    expect(routes.slice(start).includes(push)).toBe(declared);
  }
});

it.each([
  ['coupons', 'acceptsCoupons', 'stock', ['site']], ['cashRounding', 'acceptsCashRounding', 'fork', ['status', 'site']],
  ['multiplePayments', 'acceptsPaymentsList', 'list', ['status']],
] as const)('resolves %s option once per batch needing it', async (feature, option, status, reads) => {
  const flag = vi.fn(async () => true);
  const { transport, routes } = store(status, '1.10.19', { [option]: flag });
  await transport.send([sale('ordinary')]);
  expect(flag).not.toHaveBeenCalled();
  await transport.send([sale(feature), sale(feature, 'second')]);
  expect(flag).toHaveBeenCalledTimes(1);
  expect(routes).toEqual([push, ...reads, push, push]);
});

it('returns earlier batch results when a needed store read fails', async () => {
  const { transport, routes } = store(500, '1.9.0');
  expect(await transport.send([sale('coupons'), sale('multiplePayments')])).toMatchObject({ kind: 'results', results: [{ id: 'coupons', status: 'applied' }] });
  expect(routes).toEqual(['site', push, 'status']);
});
