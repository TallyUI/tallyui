// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { OrderCreateEnvelope, OrderCreatePayload } from '../types'
import { precheckCommand } from './batch'
import { SUPPORTED_ORDER_CREATE_VERSIONS } from './versions'

const payload: OrderCreatePayload = {
  clientOrderId: 'order_1', createdAt: '2026-11-18T10:00:00Z', currency: 'EUR', pricesIncludeTax: true,
  lines: [{ clientLineId: 'line_1', variantId: 'variant_1', title: 'Coffee', quantity: 1, unitPriceMinor: 1000 }],
  subtotalMinor: 840, taxMinor: 160, totalMinor: 1000,
  payments: [
    { clientPaymentId: 'payment_1', method: 'cash', amountMinor: 400, tenderedMinor: 500, changeMinor: 100, methodId: 'cod' },
    { clientPaymentId: 'payment_2', method: 'external', amountMinor: 600, reference: 'T-1', methodId: 'stripe_terminal_for_woocommerce' },
  ],
  customer: null,
}
const envelope = (version: number, body: OrderCreatePayload = payload) => ({
  id: 'sale-10', type: 'order.create', version, payload: body, createdAt: '2026-11-18T10:00:00Z', deviceId: 'register-1', attempt: 1,
}) as OrderCreateEnvelope
const server = { orderCreate: [...SUPPORTED_ORDER_CREATE_VERSIONS], register: [1] }
const withMethodId = (methodId: string) => ({ ...payload, payments: [{ ...payload.payments[0], methodId }] })
const refused = (message: string) => ({ id: 'sale-10', status: 'rejected', error: { code: 'invalid_payload', message } })

describe('order.create version 10: payments[].methodId (condition 2)', () => {
  it('accepts a valid version-10 payload whose payments carry methodIds', () => {
    expect(server.orderCreate).toContain(10)
    expect(precheckCommand(envelope(10), server)).toBeUndefined()
  })

  it('accepts version 10 with no methodId: there is no "version 10 requires methodId" rule', () => {
    const { methodId: _a, ...cash } = payload.payments[0], { methodId: _b, ...card } = payload.payments[1]
    expect(precheckCommand(envelope(10, { ...payload, payments: [cash, card] }), server)).toBeUndefined()
  })

  it.each([9, 7, 5])('refuses a methodId at version %i', (version) => {
    expect(precheckCommand(envelope(version), server)).toEqual(refused('payments[].methodId requires version 10'))
  })

  it('refuses an empty id, a 65-character id and a NUL, and accepts a 64-character id', () => {
    expect(precheckCommand(envelope(10, withMethodId('')), server)).toEqual(refused('payments[0].methodId: expected a non-empty string'))
    expect(precheckCommand(envelope(10, withMethodId('x'.repeat(65))), server))
      .toEqual(refused('payments[0].methodId: expected at most 64 characters'))
    expect(precheckCommand(envelope(10, withMethodId('co\u0000d')), server)).toEqual(refused('payments[0].methodId: expected no NUL character'))
    expect(precheckCommand(envelope(10, withMethodId('x'.repeat(64))), server)).toBeUndefined()
  })

  it('refuses a version-10 coupon without lines under the unchanged version-9 rule', () => {
    const coupon = { ...payload, coupons: [{ code: 'c', couponId: '1', discountMinor: 0, discountTaxMinor: 0 }] }
    expect(precheckCommand(envelope(10, coupon), server)).toEqual(refused('version 9 requires coupons[].lines'))
  })

  it('a server whose orderCreate list stops at 9 refuses version 10 as unsupported_version', () => {
    expect(precheckCommand(envelope(10), { orderCreate: [1, 2, 3, 4, 5, 6, 7, 8, 9], register: [1] })).toEqual({
      id: 'sale-10', status: 'rejected', error: { code: 'unsupported_version',
        message: 'order.create version 10 is not supported; this server supports 1, 2, 3, 4, 5, 6, 7, 8, 9', data: { orderCreate: 9 } },
    })
  })
})
