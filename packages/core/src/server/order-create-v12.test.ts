// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { OrderCreateEnvelope, OrderCreatePayload } from '../types'
import { precheckCommand } from './batch'
import { payloadBoundErrors, payloadShapeErrors } from './order-payload-shape'
import { SUPPORTED_ORDER_CREATE_VERSIONS } from './versions'

const taxIds = [{ type: 'eu_vat', value: 'DE123456789', country: 'DE' }, { type: 'us_ein', value: '12-3456789' }]
const meta = [{ key: 'po_number', value: 'PO-1' }, { key: 'gift_message', value: '' }]
const base: OrderCreatePayload = {
  clientOrderId: 'order_1', createdAt: '2026-11-19T10:00:00Z', currency: 'EUR', pricesIncludeTax: true,
  lines: [{ clientLineId: 'line_1', variantId: 'variant_1', title: 'Coffee', quantity: 1, unitPriceMinor: 1000 }],
  subtotalMinor: 840, taxMinor: 160, totalMinor: 1000,
  payments: [{ clientPaymentId: 'payment_1', method: 'cash', amountMinor: 1000 }],
  customer: { email: 'ann@example.com', customerId: '42' },
}
const payload: OrderCreatePayload = { ...base, customer: { ...base.customer, taxIds }, lines: [{ ...base.lines[0], sku: 'COF-1-EDIT' }], meta }
const envelope = (version: number, body: OrderCreatePayload = payload) => ({
  id: 'sale-12', type: 'order.create', version, payload: body, createdAt: '2026-11-19T10:00:00Z', deviceId: 'register-1', attempt: 1,
}) as OrderCreateEnvelope
const server = { orderCreate: [...SUPPORTED_ORDER_CREATE_VERSIONS], register: [1], orderUpdate: [1] }
const refused = (message: string) => ({ id: 'sale-12', status: 'rejected', error: { code: 'invalid_payload', message } })
const all = 'customer.taxIds requires version 12; lines[0].sku requires version 12; meta requires version 12'
const text = (length: number) => 'x'.repeat(length)

describe('order.create version 12: tax ids, a line\'s SKU and order meta (ADR-092)', () => {
  it('C1 lists 12, and a version-12 payload with tax ids, meta and a catalogue line\'s sku passes', () => {
    expect(SUPPORTED_ORDER_CREATE_VERSIONS).toContain(12)
    expect(precheckCommand(envelope(12), server)).toBeUndefined()
    expect(payloadShapeErrors(payload)).toEqual([])
    expect(payloadBoundErrors(payload)).toEqual([])
    expect(precheckCommand(envelope(12, base), server)).toBeUndefined()
  })

  it('C2 refuses each field below 12 with its own message, and all three joined in order', () => {
    expect(precheckCommand(envelope(11, { ...base, customer: { taxIds } }), server)).toEqual(refused('customer.taxIds requires version 12'))
    expect(precheckCommand(envelope(11, { ...base, lines: payload.lines }), server)).toEqual(refused('lines[0].sku requires version 12'))
    expect(precheckCommand(envelope(11, { ...base, meta }), server)).toEqual(refused('meta requires version 12'))
    expect(precheckCommand(envelope(11), server)).toEqual(refused(all))
    expect(precheckCommand(envelope(10), server)).toEqual(refused(all))
    expect(precheckCommand(envelope(11, base), server)).toBeUndefined()
  })

  it.each<[string, Partial<OrderCreatePayload>]>([
    ['customer.taxIds[0].label: expected no unknown key', { customer: { taxIds: [{ ...taxIds[0], label: 'VAT' } as never] } }],
    ['meta[0].id: expected no unknown key', { meta: [{ ...meta[0], id: 7 } as never] }],
    ['customer.taxIds[0].type: expected a non-empty string', { customer: { taxIds: [{ ...taxIds[0], type: '' }] } }],
    ['customer.taxIds[0].value: expected a non-empty string', { customer: { taxIds: [{ ...taxIds[0], value: '' }] } }],
    ['customer.taxIds[0].country: expected an ISO 3166-1 alpha-2 code', { customer: { taxIds: [{ ...taxIds[0], country: 'usa' }] } }],
    ['meta[0].key: expected a key not starting with _', { meta: [{ key: '_secret', value: 'x' }] }],
    ['meta[1].key: expected no duplicate key', { meta: [meta[0], { key: 'po_number', value: 'PO-2' }] }],
    ['lines[0].sku: expected a non-empty string', { lines: [{ ...base.lines[0], sku: '' }] }],
    ['lines[0].sku: expected absent on a custom line (custom.sku)', { lines: [{ clientLineId: 'line_1', custom: { name: 'Gift wrap', taxStatus: 'none' },
      title: 'Gift wrap', quantity: 1, unitPriceMinor: 1000, sku: 'GIFT' }] }],
  ])('C3 shape: %s', (message, change) => {
    expect(payloadShapeErrors({ ...payload, ...change })).toEqual([message])
  })

  it('C3 precheckCommand refuses a shape error at 12', () => {
    expect(precheckCommand(envelope(12, { ...payload, meta: [{ key: '_secret', value: 'x' }] }), server))
      .toEqual(refused('meta[0].key: expected a key not starting with _'))
  })

  it('C4 bounds: every field at its limit passes; one past each is refused', () => {
    const atLimit: OrderCreatePayload = { ...payload,
      customer: { taxIds: Array.from({ length: 10 }, (_, i) => ({ type: text(31) + i, value: text(64), country: 'DE' })) },
      lines: [{ ...base.lines[0], sku: text(100) }],
      meta: Array.from({ length: 50 }, (_, i) => ({ key: text(255 - String(i).length) + i, value: text(1000) })) }
    expect(payloadShapeErrors(atLimit)).toEqual([])
    expect(payloadBoundErrors(atLimit)).toEqual([])
    expect(precheckCommand(envelope(12, atLimit), server)).toBeUndefined()
    const past: Array<[string, Partial<OrderCreatePayload>]> = [
      ['customer.taxIds: expected at most 10 entries', { customer: { taxIds: Array.from({ length: 11 }, (_, i) => ({ type: `t${i}`, value: 'v' })) } }],
      ['customer.taxIds[0].type: expected at most 32 characters', { customer: { taxIds: [{ type: text(33), value: 'v' }] } }],
      ['customer.taxIds[0].value: expected at most 64 characters', { customer: { taxIds: [{ type: 't', value: text(65) }] } }],
      ['meta: expected at most 50 entries', { meta: Array.from({ length: 51 }, (_, i) => ({ key: `k${i}`, value: '' })) }],
      ['meta[0].key: expected at most 255 characters', { meta: [{ key: text(256), value: '' }] }],
      ['meta[0].value: expected at most 1000 characters', { meta: [{ key: 'k', value: text(1001) }] }],
      ['lines[0].sku: expected at most 100 characters', { lines: [{ ...base.lines[0], sku: text(101) }] }],
    ]
    for (const [message, change] of past) {
      expect(payloadBoundErrors({ ...payload, ...change })).toEqual([message])
      expect(precheckCommand(envelope(12, { ...payload, ...change }), server)).toEqual(refused(message))
    }
  })

  it('C5 refuses a NUL in a meta value', () => {
    expect(precheckCommand(envelope(12, { ...payload, meta: [{ key: 'k', value: 'a\u0000b' }] }), server))
      .toEqual(refused('meta[0].value: expected no NUL character'))
  })

  it('C6 an order.update at createVersion 12 carries the fields; at createVersion 11 it gets the C2 refusal', () => {
    const update = (createVersion: number) => ({ id: 'sale-12', type: 'order.update' as const, version: 1, payload: { ...payload, orderId: '4711',
      baseRevision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298', createVersion,
      lines: payload.lines.map(line => ({ ...line, storeLineId: '31' })) } })
    expect(precheckCommand(update(12), server)).toBeUndefined()
    expect(precheckCommand(update(11), server)).toEqual(refused(all))
  })
})
