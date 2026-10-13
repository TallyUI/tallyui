// @vitest-environment node
import { expect, it } from 'vitest'
import type { OrderRefundPayload } from '../types/commands'
import { refundPayloadErrors } from './index'

const line = { orderLineId: 'line-1', quantity: 1, restock: true }
const payload: OrderRefundPayload = {
  clientRefundId: 'refund-1', orderId: 'order-1', registerId: 'register-1', sessionId: 'session-1',
  lines: [line], shippingMinor: 0, adjustmentMinor: 0, totalMinor: 100,
  destination: 'original_method', reason: 'Returned item', createdAt: '2026-01-01T08:00:00.000Z',
}

it('accepts valid payloads, optional ids, empty lines and signed adjustments without checking totals', () => {
  expect(refundPayloadErrors(payload)).toEqual([])
  expect(refundPayloadErrors({ ...payload, lines: [], adjustmentMinor: -250, destination: 'cash',
    clientOrderId: 'client-order', cashierRef: 'cashier' })).toEqual([])
  expect(refundPayloadErrors(Object.assign(Object.create(null), payload))).toEqual([])
})

it('accepts the id, reason and line count limits', () => {
  expect(refundPayloadErrors({ ...payload, clientRefundId: 'r'.repeat(64), reason: 'r'.repeat(500),
    lines: Array.from({ length: 500 }, (_, i) => ({ ...line, orderLineId: String(i).padStart(64, '0') })) })).toEqual([])
})

it.each([null, undefined, 'refund', 1, [], new Date()])('rejects a non-object payload: %s', value => {
  expect(refundPayloadErrors(value)).toEqual(['payload: expected an object'])
})

it.each([null, 'line', 1, [], new Date()])('rejects a non-object line without checking its fields: %s', value => {
  expect(refundPayloadErrors({ ...payload, lines: [value] })).toEqual(['lines[0]: expected an object'])
})

it('refuses unknown fields before checking the fields of each object, in key order', () => {
  expect(refundPayloadErrors({ ...payload, refundId: 'r', extra: true, orderId: '' })).toEqual([
    'refundId: unknown field for order.refund version 1', 'extra: unknown field for order.refund version 1',
    'orderId: expected a non-empty string of at most 64 characters',
  ])
  expect(refundPayloadErrors({ ...payload, lines: [{ ...line, price: 100, extra: true, quantity: 0 }] })).toEqual([
    'lines[0].price: unknown field for order.refund version 1', 'lines[0].extra: unknown field for order.refund version 1',
    'lines[0].quantity: expected a safe integer >= 1',
  ])
})

it.each(['clientRefundId', 'orderId', 'registerId', 'sessionId', 'clientOrderId', 'cashierRef'])(
  'checks the id %s and refuses NUL', field => {
    for (const value of ['', 'x'.repeat(65), null, 1]) {
      expect(refundPayloadErrors({ ...payload, [field]: value }))
        .toEqual([`${field}: expected a non-empty string of at most 64 characters`])
    }
    expect(refundPayloadErrors({ ...payload, [field]: 'x\u0000' })).toEqual([`${field}: expected no NUL character`])
  },
)

it.each(['clientRefundId', 'orderId', 'registerId', 'sessionId'])('requires %s', field => {
  expect(refundPayloadErrors({ ...payload, [field]: undefined }))
    .toEqual([`${field}: expected a non-empty string of at most 64 characters`])
})

it.each<[string, unknown, string]>([
  ['lines', null, 'an array of at most 500 lines'],
  ['lines', Array.from({ length: 501 }, (_, i) => ({ ...line, orderLineId: String(i) })), 'an array of at most 500 lines'],
  ['shippingMinor', -1, 'a safe integer >= 0'],
  ['totalMinor', -1, 'a safe integer >= 0'],
  ['adjustmentMinor', 1.5, 'a safe integer'],
  ['destination', 'card', 'original_method or cash'],
  ['reason', ' \t ', 'a non-empty string after trim of at most 500 characters'],
  ['reason', 'r'.repeat(501), 'a non-empty string after trim of at most 500 characters'],
  ['reason', 1, 'a non-empty string after trim of at most 500 characters'],
  ['createdAt', 'not a date', 'a valid date'],
  ['createdAt', '', 'a valid date'],
  ['createdAt', 1, 'a valid date'],
])('rejects invalid %s (%s)', (field, value, expected) => {
  expect(refundPayloadErrors({ ...payload, [field]: value })).toEqual([`${field}: expected ${expected}`])
})

it.each(['shippingMinor', 'totalMinor', 'adjustmentMinor'])('requires a safe integer for %s', field => {
  for (const value of [undefined, '100', 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) {
    expect(refundPayloadErrors({ ...payload, [field]: value }))
      .toEqual([`${field}: expected a safe integer${field === 'adjustmentMinor' ? '' : ' >= 0'}`])
  }
})

it.each<[string, unknown, string]>([
  ['orderLineId', '', 'a non-empty string of at most 64 characters'],
  ['orderLineId', 'x'.repeat(65), 'a non-empty string of at most 64 characters'],
  ['orderLineId', null, 'a non-empty string of at most 64 characters'],
  ['quantity', 0, 'a safe integer >= 1'],
  ['quantity', 1.5, 'a safe integer >= 1'],
  ['quantity', Number.MAX_SAFE_INTEGER + 1, 'a safe integer >= 1'],
  ['quantity', '1', 'a safe integer >= 1'],
  ['restock', 'yes', 'a boolean'],
])('rejects invalid line %s (%s)', (field, value, expected) => {
  expect(refundPayloadErrors({ ...payload, lines: [{ ...line, [field]: value }] }))
    .toEqual([`lines[0].${field}: expected ${expected}`])
})

it('rejects duplicate line ids', () => {
  expect(refundPayloadErrors({ ...payload, lines: [line, { ...line, restock: false }] }))
    .toEqual(['lines[1].orderLineId: expected unique in lines'])
})

it('rejects NUL in reason and orderLineId', () => {
  expect(refundPayloadErrors({ ...payload, reason: 'bad\u0000reason' })).toEqual(['reason: expected no NUL character'])
  expect(refundPayloadErrors({ ...payload, lines: [{ ...line, orderLineId: 'bad\u0000id' }] }))
    .toEqual(['lines[0].orderLineId: expected no NUL character'])
})

it.each(['destination', 'createdAt'])('also reports NUL in %s', field => {
  expect(refundPayloadErrors({ ...payload, [field]: `${payload[field as keyof OrderRefundPayload]}\u0000` }))
    .toContain(`${field}: expected no NUL character`)
})

it('quotes unknown keys containing NUL at either level', () => {
  expect(refundPayloadErrors({ ...payload, ['bad\u0000key']: true,
    lines: [{ ...line, ['bad\u0000key']: true }] })).toEqual([
    '"bad\\u0000key": unknown field for order.refund version 1',
    'lines[0]."bad\\u0000key": unknown field for order.refund version 1',
  ])
})

it('caps unknown-field and field-check errors at ten', () => {
  const unknown = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`extra${i}`, true]))
  expect(refundPayloadErrors(unknown)).toEqual(Array.from({ length: 10 }, (_, i) =>
    `extra${i}: unknown field for order.refund version 1`))
  expect(refundPayloadErrors({})).toHaveLength(10)
  expect(refundPayloadErrors({ ...payload, lines: [unknown, {}] })).toHaveLength(10)
})
