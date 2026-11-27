import { expect, it } from 'vitest'
import { payloadShapeErrors, precheckCommand } from './index'

const supported = { orderCreate: [5], register: [1] }
const fee = { clientFeeId: 'fee', name: 'Bag', amountMinor: 20, taxMinor: 0, taxStatus: 'taxable' }
const shipping = { clientShippingId: 'shipping', name: 'Delivery', amountMinor: 50, taxMinor: 0, taxStatus: 'taxable' }
const payload = {
  clientOrderId: 'order', createdAt: '2026-11-22T10:00:00.000Z', currency: 'EUR', pricesIncludeTax: false,
  lines: [{ clientLineId: 'line', variantId: 'p', quantity: 1, unitPriceMinor: 100 }], fees: [fee], shipping: [shipping],
  payments: [{ clientPaymentId: 'payment', method: 'cash', amountMinor: 170 }], taxExempt: true,
  subtotalMinor: 100, taxMinor: 0, totalMinor: 170,
  display: { currency: 'EUR', exponent: 2, taxInclusive: false, subtotalMinor: 100, discountMinor: 0, taxMinor: 0, totalMinor: 170,
    lines: [{ clientLineId: 'line', amountMinor: 100, discounts: [] }], orderDiscountMinor: 0,
    fees: [{ clientFeeId: 'fee', amountMinor: 20 }], shipping: [{ clientShippingId: 'shipping', amountMinor: 50 }] },
  taxByRate: [{ ratePpm: 0, netMinor: 170, taxMinor: 0, grossMinor: 170 }],
}
const command = { id: 'command', type: 'order.create' as const, version: 5, payload }

it('X4 accepts an exempt sale only when the server declares taxExempt', () => {
  expect(precheckCommand(command, { ...supported, taxExempt: true })).toBeUndefined()
  expect(precheckCommand(command, supported)).toMatchObject({ status: 'rejected', error: { code: 'invalid_payload',
    message: 'taxExempt requires the taxExempt capability, which this server does not declare' } })
})

it.each([false, 'yes'])('X8 rejects taxExempt: %s', taxExempt => {
  expect(payloadShapeErrors({ ...payload, taxExempt })).toEqual(['taxExempt: expected true when present'])
})

it.each([
  ['taxMinor', { taxMinor: 5 }], ['fees[0].taxMinor', { fees: [{ ...fee, taxMinor: 5 }] }],
  ['shipping[0].taxMinor', { shipping: [{ ...shipping, taxMinor: 5 }] }],
  ['taxByRate[0].taxMinor', { taxByRate: [{ ...payload.taxByRate[0], taxMinor: 5 }] }],
  ['display.taxMinor', { display: { ...payload.display, taxMinor: 5 } }],
] as const)('X9 rejects nonzero %s', (path, change) => {
  expect(payloadShapeErrors({ ...payload, ...change })).toEqual([`${path}: expected 0 on a tax-exempt order`])
})

it('X10 refuses taxExempt on order.update even with the capability', () => {
  expect(precheckCommand({ ...command, type: 'order.update', version: 1, payload: { ...payload, orderId: 'store', createVersion: 5 } },
    { ...supported, orderUpdate: [1], taxExempt: true })).toMatchObject({ status: 'rejected', error: { code: 'invalid_payload',
    message: 'taxExempt is not accepted on order.update' } })
})

const coupon = { code: 'ten', couponId: '1', discountMinor: 10, discountTaxMinor: 3 }

it('X18 rejects coupon tax on an exempt payload without coupon lines', () => {
  expect(payloadShapeErrors({ ...payload, coupons: [coupon] })).toEqual(['coupons[0].discountTaxMinor: expected 0 on a tax-exempt order'])
})

it('X19 rejects both coupon and line tax on an exempt payload even when the amounts agree', () => {
  const lines = [{ clientLineId: 'line', discountMinor: 10, discountTaxMinor: 3 }]
  expect(payloadShapeErrors({ ...payload, coupons: [{ ...coupon, lines }] })).toEqual([
    'coupons[0].discountTaxMinor: expected 0 on a tax-exempt order',
    'coupons[0].lines[0].discountTaxMinor: expected 0 on a tax-exempt order',
  ])
})
