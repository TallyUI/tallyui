// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ORDER_NOTE_MAX } from '../commands'
import type { OrderCreatePayload } from '../types'
import { precheckCommand } from './batch'
import { payloadBoundErrors, payloadShapeErrors } from './order-payload-shape'

const supported = { orderCreate: [1, 2, 3, 4, 5, 6, 7], register: [1] }
const v7: OrderCreatePayload = {
  clientOrderId: 'order', createdAt: '2026-10-07T10:00:00.000Z', currency: 'EUR', pricesIncludeTax: false,
  lines: [{ clientLineId: 'line', variantId: 'variant', quantity: 1, unitPriceMinor: 1000 }],
  fees: [{ clientFeeId: 'fee', name: 'Bag', amountMinor: 20, taxStatus: 'taxable', taxMinor: 4 }],
  subtotalMinor: 1000, taxMinor: 204, totalMinor: 1224,
  payments: [{ clientPaymentId: 'payment', method: 'cash', amountMinor: 1224 }],
  display: { currency: 'EUR', exponent: 2, taxInclusive: false, subtotalMinor: 1000, discountMinor: 0,
    taxMinor: 204, totalMinor: 1224, orderDiscountMinor: 0,
    lines: [{ clientLineId: 'line', amountMinor: 1000, discounts: [] }],
    fees: [{ clientFeeId: 'fee', amountMinor: 20 }] },
  taxByRate: [{ ratePpm: 200000, netMinor: 1020, taxMinor: 204, grossMinor: 1224 }],
  note: 'Gift wrap, please',
}

describe('order.create v7 (sale note, ADR-083)', () => {
  it('accepts a payload with a note', () => {
    expect(payloadShapeErrors(v7)).toEqual([])
    expect(payloadBoundErrors(v7)).toEqual([])
    expect(precheckCommand({ id: 'command', type: 'order.create', version: 7, payload: v7 }, supported)).toBeUndefined()
  })

  it('accepts a payload without a note', () => {
    const { note: _note, ...payload } = v7
    expect(precheckCommand({ id: 'command', type: 'order.create', version: 7, payload }, supported)).toBeUndefined()
  })

  it.each([6, 5])('refuses a note at version %s', (version) => {
    expect(precheckCommand({ id: 'command', type: 'order.create', version, payload: v7 }, supported))
      .toMatchObject({ status: 'rejected', error: { code: 'invalid_payload', message: 'note requires version 7' } })
  })

  it('refuses v7 when the server does not advertise it', () => {
    expect(precheckCommand({ id: 'command', type: 'order.create', version: 7, payload: v7 },
      { orderCreate: [1, 2, 3, 4, 5, 6], register: [1] })).toMatchObject({
      status: 'rejected', error: { code: 'unsupported_version', data: { orderCreate: 6 } },
    })
  })

  it.each(['', 5])('refuses a malformed note %j', (note) => {
    expect(precheckCommand({ id: 'command', type: 'order.create', version: 7, payload: { ...v7, note } }, supported))
      .toMatchObject({ status: 'rejected', error: { code: 'invalid_payload', message: 'note: expected a non-empty string' } })
  })

  it('refuses a note containing NUL', () => {
    expect(precheckCommand({ id: 'command', type: 'order.create', version: 7, payload: { ...v7, note: 'Gift\u0000wrap' } }, supported))
      .toMatchObject({ status: 'rejected', error: { code: 'invalid_payload', message: 'note: expected no NUL character' } })
  })

  it('accepts exactly ORDER_NOTE_MAX UTF-16 units and refuses one more', () => {
    const payload = { ...v7, note: 'x'.repeat(ORDER_NOTE_MAX) }
    expect(payloadShapeErrors(payload)).toEqual([])
    expect(payloadBoundErrors(payload)).toEqual([])
    expect(precheckCommand({ id: 'command', type: 'order.create', version: 7, payload }, supported)).toBeUndefined()
    expect(precheckCommand({ id: 'command', type: 'order.create', version: 7,
      payload: { ...v7, note: 'x'.repeat(ORDER_NOTE_MAX + 1) } }, supported))
      .toMatchObject({ status: 'rejected', error: { code: 'invalid_payload', message: 'note: expected at most 1000 characters' } })
  })
})
