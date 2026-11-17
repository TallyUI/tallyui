// @vitest-environment node
import { expect, it } from 'vitest'
import fixture from './__fixtures__/order-create-v3.json'
import { SUPPORTED_ORDER_UPDATE_VERSIONS, updatePayloadErrors } from './index'
import { orderCreatePart } from './update-payload-shape'

const payload = {
  ...fixture.payload, orderId: 'order-1', baseRevision: 'revision-1', createVersion: 9,
  lines: fixture.payload.lines.map((line, i) => ({ ...line, discountMinor: [169, 37][i], storeLineId: `line-${i}` })),
  discountMinor: 206,
  payments: fixture.payload.payments.map(payment => ({ ...payment, paymentId: 'payment-1' })),
}

// Fee and shipping items from the valid order-create-v5 fixtures.
const fee = { clientFeeId: '0199b0a0-0000-7000-8000-0000000000f1', name: 'Bag', amountMinor: 20,
  taxStatus: 'taxable', taxMinor: 4 }
const shipping = { clientShippingId: '0199b0a0-0000-7000-8000-0000000000d1', name: 'Local delivery', methodId: 'flat_rate',
  amountMinor: 500, taxStatus: 'taxable', taxMinor: 100 }
const withCharges = { ...payload, fees: [{ ...fee, storeLineId: 'fee-1' }], shipping: [{ ...shipping, storeLineId: 'shipping-1' }] }

it('accepts kept fees and shipping with store order-item ids (ADR-090)', () => {
  expect(updatePayloadErrors(withCharges)).toEqual([])
})

it('rejects an empty fee store id', () => {
  expect(updatePayloadErrors({ ...withCharges, fees: [{ ...fee, storeLineId: '' }] }))
    .toEqual(['fees[0].storeLineId: expected a non-empty string of at most 64 characters'])
})

it('rejects a shipping store id shared with a line', () => {
  expect(updatePayloadErrors({ ...withCharges, shipping: [{ ...shipping, storeLineId: payload.lines[0].storeLineId }] }))
    .toEqual(['shipping[0].storeLineId: expected unique'])
})

it('accepts a v9-shaped update with kept and new lines and payments (ADR-090)', () => {
  expect(SUPPORTED_ORDER_UPDATE_VERSIONS).toEqual([1])
  expect(updatePayloadErrors(payload)).toEqual([])
  expect(updatePayloadErrors({ ...payload, baseRevision: undefined,
    lines: fixture.payload.lines, discountMinor: fixture.payload.discountMinor, payments: fixture.payload.payments })).toEqual([])
  expect(updatePayloadErrors(Object.assign(Object.create(null), payload))).toEqual([])
})

it.each([null, undefined, 'update', 1, [], new Date()])('rejects a non-plain object: %s', value => {
  expect(updatePayloadErrors(value)).toEqual(['payload: expected an object'])
})

it.each([
  [{ orderId: undefined }, 'orderId: expected a non-empty string of at most 64 characters'],
  [{ baseRevision: 'x'.repeat(65) }, 'baseRevision: expected a non-empty string of at most 64 characters'],
  [{ createVersion: 0 }, 'createVersion: expected a positive safe integer'],
  [{ createVersion: 1.5 }, 'createVersion: expected a positive safe integer'],
  [{ createVersion: Number.MAX_SAFE_INTEGER + 1 }, 'createVersion: expected a positive safe integer'],
  [{ orderId: 'order\u0000' }, 'orderId: expected no NUL character'],
  [{ lines: undefined }, 'lines: expected a non-empty array'],
])('reports the exact field error for %j', (fields, message) => {
  expect(updatePayloadErrors({ ...payload, ...fields })).toEqual([message])
})

it.each([['lines', 'storeLineId'], ['payments', 'paymentId']] as const)('checks %s store identities', (field, key) => {
  for (const value of ['', 'x'.repeat(65), null, 7, 'x\u0000']) {
    const items = payload[field].map((item, i) => i === 0 ? { ...item, [key]: value } : item)
    expect(updatePayloadErrors({ ...payload, [field]: items })).toEqual([
      `${field}[0].${key}: expected ${value === 'x\u0000' ? 'no NUL character' : 'a non-empty string of at most 64 characters'}`,
    ])
  }
})

it('rejects duplicate line and payment store identities', () => {
  expect(updatePayloadErrors({ ...payload, lines: payload.lines.map(line => ({ ...line, storeLineId: 'same' })) }))
    .toEqual(['lines[1].storeLineId: expected unique'])
  expect(updatePayloadErrors({ ...payload, payments: [payload.payments[0], payload.payments[0]] }))
    .toEqual(['payments[1].paymentId: expected unique'])
})

it('caps update-only and combined shape errors at ten', () => {
  const payments = Array.from({ length: 12 }, (_, i) => ({ ...payload.payments[0], paymentId: `${i}\u0000` }))
  expect(updatePayloadErrors({ ...payload, payments })).toEqual(Array.from({ length: 10 }, (_, i) =>
    `payments[${i}].paymentId: expected no NUL character`))
  expect(updatePayloadErrors({ createVersion: 0 })).toHaveLength(10)
})

it('strips all five update fields without changing its input', () => {
  const before = structuredClone(payload)
  const part = orderCreatePart(payload)
  expect(part).toEqual({ ...fixture.payload, discountMinor: 206,
    lines: fixture.payload.lines.map((line, i) => ({ ...line, discountMinor: [169, 37][i] })) })
  expect(payload).toEqual(before)
  expect(part).not.toBe(payload)
  expect(part.lines).not.toBe(payload.lines)
  expect(part.payments).not.toBe(payload.payments)
  const beforeCharges = structuredClone(withCharges)
  expect(orderCreatePart(withCharges)).toEqual({ ...part, fees: [fee], shipping: [shipping] })
  expect(withCharges).toEqual(beforeCharges)
})

it.each([undefined, null, 'invalid', [null, 1, 'line', []]])('preserves non-arrays and non-object items: %j', value => {
  expect(orderCreatePart({ lines: value, payments: value })).toEqual({ lines: value, payments: value })
})
