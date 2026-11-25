// @vitest-environment node
// ADR-094 F5: a server whose connector does not declare `cashRounding` refuses an order carrying `cashRoundings`,
// on order.create and on an order.update's create part, and never strips the field (a dropped entry is a wrong total).
import { describe, expect, it } from 'vitest'
import fixture from './__fixtures__/order-create-v3.json'
import { precheckCommand } from './batch'

const cashRoundings = [{ paymentId: fixture.payload.payments[0].clientPaymentId, minor: 5 }]
// Carries the rounding, with the total (payload and display) and the cash payment moved by its 5 so the figures add up.
const withRounding = <P extends typeof fixture.payload>(payload: P) => ({ ...payload, cashRoundings,
  totalMinor: payload.totalMinor + 5, display: { ...payload.display, totalMinor: payload.display.totalMinor + 5 },
  payments: payload.payments.map(payment => ({ ...payment, amountMinor: payment.amountMinor + 5, changeMinor: payment.changeMinor - 5 })) })
const refusal = (id: string) => ({ id, status: 'rejected', error: { code: 'invalid_payload',
  message: 'cashRoundings requires the cashRounding capability, which this server does not declare' } })

describe('F5: precheckCommand and the cashRounding capability', () => {
  const server = { orderCreate: [1, 2, 3], register: [1] }
  const create = { ...fixture, payload: withRounding(fixture.payload) }

  it.each([{}, { cashRounding: false }])('refuses order.create with cashRoundings when the server declares %j, keeping the field', (flag) => {
    expect(precheckCommand(fixture as never, { ...server, ...flag })).toBeUndefined()
    expect(precheckCommand(create as never, { ...server, ...flag })).toEqual(refusal(fixture.id))
    expect(create.payload.cashRoundings).toEqual(cashRoundings)
  })

  it('passes order.create with cashRoundings when the server declares cashRounding', () => {
    expect(precheckCommand(create as never, { ...server, cashRounding: true })).toBeUndefined()
  })

  // batch.test.ts's order.update, which passes precheckCommand as it is.
  const updatePayload = { ...fixture.payload, orderId: 'order-1', baseRevision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298', createVersion: 9,
    lines: fixture.payload.lines.map((line, i) => ({ ...line, discountMinor: [169, 37][i], storeLineId: `line-${i}` })),
    discountMinor: 206, payments: fixture.payload.payments.map(payment => ({ ...payment, paymentId: 'payment-1' })) }
  const update = { id: 'sale-1', type: 'order.update' as const, version: 1, payload: withRounding(updatePayload) }
  const updateServer = { orderCreate: [1, 6, 9], register: [1], orderUpdate: [1] }

  it('refuses an order.update whose create part carries cashRoundings without the flag, keeping the field', () => {
    expect(precheckCommand({ ...update, payload: updatePayload }, updateServer)).toBeUndefined()
    expect(precheckCommand(update, updateServer)).toEqual(refusal('sale-1'))
    expect(update.payload.cashRoundings).toEqual(cashRoundings)
  })

  it('passes that order.update when the server declares cashRounding', () => {
    expect(precheckCommand(update, { ...updateServer, cashRounding: true })).toBeUndefined()
  })
})
