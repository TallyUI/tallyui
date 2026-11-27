import { describe, expect, it, vi } from 'vitest';
import fixture from '../__tests__/fixtures/tax-exempt-probe-2026-11-27/probe.json';
import { probeCases, probeEnvelope } from './tax-exempt-probe-envelopes';
import { createWooCommandTransport } from './transport';

const baseUrl = 'https://shop.example/wp-json/wcpos/v2';

describe.each(['ledger', 'completed'] as const)('%s probe', (mode) => {
  const ledgerPayments = mode === 'ledger';
  const gateAnswers = () => vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json(ledgerPayments ? { capabilities: [] } : {}))
    .mockResolvedValueOnce(Response.json({ wcpos_version: ledgerPayments ? '2.0.5' : '1.10.20' }));
  it.each(probeCases)('P1–P9: %s', async (name) => {
      const row = fixture[mode][name], ledger = fixture.ledger[name];
      const envelope = probeEnvelope(name, row.request, ledger.paymentRequest.payment.id);
      const offset = name === 'C1' ? 0 : 2;
      const fetch = offset ? gateAnswers() : vi.fn<typeof globalThis.fetch>();
      fetch.mockResolvedValueOnce(Response.json(row.pushResponse, { status: row.pushStatus }));
      if (ledgerPayments) fetch.mockResolvedValueOnce(Response.json(ledger.paymentResponse, { status: ledger.paymentStatus }));
      const transport = createWooCommandTransport({ baseUrl, fetch, ledgerPayments, getHeaders: () => ({}) });
      const result = await transport.send([envelope]);

      expect(fetch).toHaveBeenCalledTimes(offset + (ledgerPayments ? 2 : 1));
      const [pushUrl, push] = fetch.mock.calls[offset];
      expect(pushUrl).toBe(`${baseUrl}/push/orders`);
      expect(JSON.parse(push!.body as string)).toStrictEqual(row.request);
      if (ledgerPayments) {
        const [paymentUrl, payment] = fetch.mock.calls[offset + 1];
        expect(paymentUrl).toBe(`${baseUrl}/orders/${row.pushResponse.document.id}/payments`);
        expect(JSON.parse(payment!.body as string)).toStrictEqual({ revision: row.pushResponse.currentRevision,
          payment: { ...ledger.paymentRequest.payment, id: envelope.payload.payments[0].clientPaymentId } });
      }
      expect(result).toStrictEqual({ kind: 'results', results: [{ id: envelope.id, status: 'applied', serverRefs: {
        orderId: String(row.pushResponse.document.id), displayId: row.pushResponse.document.number, totalMinor: row.tillMinor,
      } }] });
    });

  it('D1/D2: detects one cent of tax drift on E1', async () => {
    const row = fixture[mode].E1;
    const envelope = probeEnvelope('E1', row.request, fixture.ledger.E1.paymentRequest.payment.id);
    const drift = { ...row.pushResponse, document: { ...row.pushResponse.document, total: '19.010000', total_tax: '0.010000' } };
    const fetch = gateAnswers().mockResolvedValueOnce(Response.json(drift, { status: row.pushStatus }));
    const transport = createWooCommandTransport({ baseUrl, fetch, ledgerPayments, getHeaders: () => ({}) });
    const result = await transport.send([envelope]);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetch.mock.calls[2][1]!.body as string)).toStrictEqual(row.request);
    expect(result).toMatchObject({ kind: 'results', results: [ledgerPayments
      ? { status: 'rejected', error: { code: 'invalid_payload', data: { storeCode: 'total_mismatch', tillMinor: 1900, serverMinor: 1901 } } }
      : { status: 'applied', warnings: [{ code: 'total_mismatch', expectedMinor: 1900, serverMinor: 1901 }] }] });
  });
});

it('G5: C1 makes no /status request', async () => {
  const row = fixture.completed.C1;
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json(row.pushResponse, { status: row.pushStatus }));
  const sale = probeEnvelope('C1', row.request, fixture.ledger.C1.paymentRequest.payment.id);
  const transport = createWooCommandTransport({ baseUrl, fetch, ledgerPayments: false, getHeaders: () => ({}) });
  expect(await transport.send([sale])).toMatchObject({ kind: 'results', results: [{ status: 'applied' }] });
  expect(fetch.mock.calls.map(([url]) => url)).toStrictEqual([`${baseUrl}/push/orders`]);
  expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toStrictEqual(row.request);
});
