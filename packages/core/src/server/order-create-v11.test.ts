// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { OrderCreateEnvelope, OrderCreatePayload } from '../types'
import { precheckCommand } from './batch'
import { SUPPORTED_ORDER_CREATE_VERSIONS } from './versions'

const billing = { firstName: 'Ann', lastName: 'Lee', city: 'Albany', state: 'NY', postcode: '12207', country: 'US' }
const shipping = { address1: '1 Main St', city: 'Troy', country: 'US' }
const payload: OrderCreatePayload = {
  clientOrderId: 'order_1', createdAt: '2026-11-19T10:00:00Z', currency: 'EUR', pricesIncludeTax: true,
  lines: [{ clientLineId: 'line_1', variantId: 'variant_1', title: 'Coffee', quantity: 1, unitPriceMinor: 1000 }],
  subtotalMinor: 840, taxMinor: 160, totalMinor: 1000,
  payments: [{ clientPaymentId: 'payment_1', method: 'cash', amountMinor: 1000 }],
  customer: { email: 'ann@example.com', customerId: '42', billing, shipping },
}
const envelope = (version: number, body: OrderCreatePayload = payload) => ({
  id: 'sale-11', type: 'order.create', version, payload: body, createdAt: '2026-11-19T10:00:00Z', deviceId: 'register-1', attempt: 1,
}) as OrderCreateEnvelope
const server = { orderCreate: [...SUPPORTED_ORDER_CREATE_VERSIONS], register: [1] }
const refused = (message: string) => ({ id: 'sale-11', status: 'rejected', error: { code: 'invalid_payload', message } })

describe('order.create version 11: the customer\'s addresses without taxAddress (ADR-086 d2 amended 2026-11-19)', () => {
  it('C1 accepts a version-11 payload with customer.billing and shipping and no taxAddress', () => {
    expect(server.orderCreate).toContain(11)
    expect(payload.taxAddress).toBeUndefined()
    expect(precheckCommand(envelope(11), server)).toBeUndefined()
    expect(precheckCommand(envelope(11, { ...payload, customer: { billing } }), server)).toBeUndefined()
  })

  it.each([9, 10])('C2 still refuses the same payload at version %i', (version) => {
    expect(precheckCommand(envelope(version), server)).toEqual(refused('version 9 customer address requires taxAddress'))
    expect(precheckCommand(envelope(version, { ...payload, customer: { shipping } }), server))
      .toEqual(refused('version 9 customer address requires taxAddress'))
  })

  it('C3 accepts version 11 with no address, and with taxAddress and the taxed address\'s country', () => {
    expect(precheckCommand(envelope(11, { ...payload, customer: { email: 'ann@example.com' } }), server)).toBeUndefined()
    expect(precheckCommand(envelope(11, { ...payload, customer: null }), server)).toBeUndefined()
    expect(precheckCommand(envelope(11, { ...payload, taxAddress: 'billing' }), server)).toBeUndefined()
    expect(precheckCommand(envelope(11, { ...payload, taxAddress: 'shipping' }), server)).toBeUndefined()
  })

  it('C4 a server whose orderCreate list stops at 10 refuses version 11 as unsupported_version', () => {
    expect(precheckCommand(envelope(11), { orderCreate: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], register: [1] })).toEqual({
      id: 'sale-11', status: 'rejected', error: { code: 'unsupported_version',
        message: 'order.create version 11 is not supported; this server supports 1, 2, 3, 4, 5, 6, 7, 8, 9, 10', data: { orderCreate: 10 } },
    })
  })

  it('C5 refuses a version-11 coupon without lines under the unchanged version-9 rule', () => {
    const coupon = { ...payload, coupons: [{ code: 'c', couponId: '1', discountMinor: 0, discountTaxMinor: 0 }] }
    expect(precheckCommand(envelope(11, coupon), server)).toEqual(refused('version 9 requires coupons[].lines'))
  })
})
