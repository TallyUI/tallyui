// @vitest-environment node
import { expect, it } from 'vitest'
import type { OrderReopenPayload } from '../types/commands'
import { reopenPayloadErrors, SUPPORTED_ORDER_REOPEN_VERSIONS } from './index'

const payload: OrderReopenPayload = {
  orderId: 'order-1', cashierRef: 'cashier-1', registerId: 'register-1', createdAt: '2026-01-01T08:00:00.000Z',
}

it('accepts required fields, optional ids and null-prototype payloads (ADR-090)', () => {
  expect(SUPPORTED_ORDER_REOPEN_VERSIONS).toEqual([1])
  expect(reopenPayloadErrors(payload)).toEqual([])
  expect(reopenPayloadErrors({ ...payload, clientOrderId: 'client-order', baseRevision: 'revision-1', storeId: 'store-1' })).toEqual([])
  expect(reopenPayloadErrors(Object.assign(Object.create(null), payload))).toEqual([])
})

it.each([null, undefined, 'reopen', 1, [], new Date()])('rejects a non-object payload: %s', value => {
  expect(reopenPayloadErrors(value)).toEqual(['payload: expected an object'])
})

it.each(['orderId', 'cashierRef', 'registerId', 'clientOrderId', 'baseRevision', 'storeId'])(
  'checks the id %s and refuses NUL', field => {
    expect(reopenPayloadErrors({ ...payload, [field]: 'x'.repeat(64) })).toEqual([])
    for (const value of ['', 'x'.repeat(65), null, 7]) {
      expect(reopenPayloadErrors({ ...payload, [field]: value }))
        .toEqual([`${field}: expected a non-empty string of at most 64 characters`])
    }
    expect(reopenPayloadErrors({ ...payload, [field]: 'x\u0000' })).toEqual([`${field}: expected no NUL character`])
  },
)

it.each(['orderId', 'cashierRef', 'registerId'])('requires %s', field => {
  expect(reopenPayloadErrors({ ...payload, [field]: undefined }))
    .toEqual([`${field}: expected a non-empty string of at most 64 characters`])
})

it.each(['clientOrderId', 'baseRevision', 'storeId'])('accepts undefined %s', field => {
  expect(reopenPayloadErrors({ ...payload, [field]: undefined })).toEqual([])
})

it('refuses unknown fields before checking fields and quotes keys containing NUL', () => {
  expect(reopenPayloadErrors({ ...payload, extra: true, ['bad\u0000key']: true, orderId: '' })).toEqual([
    'extra: unknown field for order.reopen version 1', '"bad\\u0000key": unknown field for order.reopen version 1',
    'orderId: expected a non-empty string of at most 64 characters',
  ])
})

it.each(['nope', '', 1, undefined])('rejects invalid createdAt (%s)', value => {
  expect(reopenPayloadErrors({ ...payload, createdAt: value })).toEqual(['createdAt: expected a valid date'])
})

it('also reports NUL in createdAt', () => {
  expect(reopenPayloadErrors({ ...payload, createdAt: `${payload.createdAt}\u0000` }))
    .toContain('createdAt: expected no NUL character')
})

it('caps unknown-field and field-check errors at ten', () => {
  const unknown = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`extra${i}`, true]))
  expect(reopenPayloadErrors(unknown)).toEqual(Array.from({ length: 10 }, (_, i) =>
    `extra${i}: unknown field for order.reopen version 1`))
  const invalid = Object.fromEntries(['orderId', 'cashierRef', 'registerId', 'clientOrderId', 'baseRevision', 'storeId']
    .map(field => [field, `${'x'.repeat(65)}\u0000`]))
  expect(reopenPayloadErrors(invalid)).toHaveLength(10)
})
