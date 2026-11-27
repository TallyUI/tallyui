import type { OrderCreateEnvelope } from '@tallyui/core';

export const probeCases = ['E1', 'E2', 'E3', 'C1'] as const;

export function probeEnvelope(name: typeof probeCases[number], ids: { mutationId: string; recordId: string }, paymentId: string,
  variantId = '15'): OrderCreateEnvelope {
  const createdAt = '2026-11-27T10:00:00.000Z';
  const exempt = name !== 'C1', gift = name === 'E2';
  const totalMinor = gift ? 2200 : exempt ? 1900 : 2090;
  return { id: ids.mutationId, type: 'order.create', version: name === 'E3' ? 8 : 5, createdAt, deviceId: 'till', attempt: 1,
    payload: { clientOrderId: ids.recordId, createdAt, currency: 'USD', pricesIncludeTax: false, ...(exempt ? { taxExempt: true } : {}),
      subtotalMinor: gift ? 1300 : 1000, taxMinor: exempt ? 0 : 190, totalMinor,
      lines: [{ clientLineId: 'product', variantId, quantity: 1, unitPriceMinor: 1000 }, ...(gift ? [{ clientLineId: 'gift',
        quantity: 1, unitPriceMinor: 300, custom: { name: 'Gift', taxStatus: 'taxable' as const } }] : [])],
      fees: [{ clientFeeId: 'fee', name: 'Bag', amountMinor: 500, taxMinor: exempt ? 0 : 50, taxStatus: 'taxable',
        ...(gift ? { taxClass: 'reduced-rate' } : {}) }],
      shipping: [{ clientShippingId: 'shipping', name: 'Post', amountMinor: 400, taxMinor: exempt ? 0 : 40, taxStatus: 'taxable' }],
      ...(name === 'E3' ? { taxAddress: 'billing', customer: { billing: { firstName: 'Probe', lastName: 'Customer', address1: '1 Test St',
        city: 'New York', state: 'NY', postcode: '10001', country: 'US' } } } : {}),
      payments: [{ clientPaymentId: paymentId, method: 'cash', amountMinor: totalMinor, tenderedMinor: totalMinor }],
    } };
}
