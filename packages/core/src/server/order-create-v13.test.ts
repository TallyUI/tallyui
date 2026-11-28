// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ORDER_TAX_EXEMPT_CERTIFICATE_MAX, ORDER_TAX_EXEMPT_REASON_MAX } from '../commands'
import type { OrderCreatePayload, OrderCreateTaxExemptReason } from '../types'
import { precheckCommand } from './batch'
import { payloadBoundErrors, payloadShapeErrors } from './order-payload-shape'
import { SUPPORTED_ORDER_CREATE_VERSIONS } from './versions'

const base: OrderCreatePayload = {
  clientOrderId: 'order_1', createdAt: '2026-11-19T10:00:00Z', currency: 'EUR', pricesIncludeTax: true,
  lines: [{ clientLineId: 'line_1', variantId: 'variant_1', title: 'Coffee', quantity: 1, unitPriceMinor: 1000 }],
  subtotalMinor: 1000, taxMinor: 0, totalMinor: 1000, taxExempt: true,
  payments: [{ clientPaymentId: 'payment_1', method: 'cash', amountMinor: 1000 }],
  customer: { email: 'ann@example.com', customerId: '42' },
}
const nonExempt = { ...base }
delete nonExempt.taxExempt
const reason = { text: 'Charity, form ST-5 on file', certificateId: 'ST5-0042' }
const payload = { ...base, taxExemptReason: reason }
const server = { orderCreate: [...SUPPORTED_ORDER_CREATE_VERSIONS], register: [1], orderUpdate: [1], taxExempt: true }
const optional = { ...server, taxExemptReason: 'optional' as const }
const required = { ...server, taxExemptReason: 'required' as const }
const invalid = { ...server, taxExemptReason: true as never }
const create = (version: 12 | 13, body: OrderCreatePayload) => ({ id: 'sale-13', type: 'order.create' as const, version, payload: body })
const update = (body: OrderCreatePayload) => ({ id: 'sale-13', type: 'order.update' as const, version: 1, payload: { ...body,
  orderId: '4711', baseRevision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298', createVersion: 13,
  lines: body.lines.map(line => ({ ...line, storeLineId: '31' })) } })
const refused = (message: string) => ({ id: 'sale-13', status: 'rejected', error: { code: 'invalid_payload', message } })
const capability = 'taxExemptReason requires the taxExemptReason capability, which this server does not declare'
const version = 'taxExemptReason requires version 13'
const missing = 'taxExempt requires taxExemptReason on this server'

describe('order.create version 13: staff-only tax exemption reason', () => {
  it('R1 lists 13', () => { expect(SUPPORTED_ORDER_CREATE_VERSIONS).toContain(13) })

  it.each([
    ['A', server, 12, base, undefined], ['B', server, 13, payload, capability],
    ['C', optional, 12, base, undefined], ['D', optional, 13, payload, undefined], ['E', optional, 12, payload, version],
    ['F1', required, 12, base, missing], ['F2', required, 13, base, missing], ['G', required, 13, payload, undefined],
    ['H12', required, 12, nonExempt, undefined], ['H13', required, 13, nonExempt, undefined],
    ['I', optional, 13, { ...nonExempt, taxExemptReason: reason }, 'taxExemptReason: expected present only on a tax-exempt order'],
    ['J', required, 12, payload, version], ['K', invalid, 13, payload, capability],
    ['L', server, 12, payload, capability],
    ['M', server, 13, { ...nonExempt, taxExemptReason: reason }, capability],
    ['N', required, 13, { ...nonExempt, taxExemptReason: reason }, 'taxExemptReason: expected present only on a tax-exempt order'],
    ['O', invalid, 13, base, undefined],
    ['P', server, 13, { ...base, taxExemptReason: { text: '' } }, capability],
  ] as const)('R1 row %s', (_row, supported, wireVersion, body, message) => {
    expect(precheckCommand(create(wireVersion, body), supported)).toEqual(message === undefined ? undefined : refused(message))
  })

  it.each([null, 'reason', []].map(value => ({ value })))('R2 rejects a non-object reason %#', ({ value }) => {
    expect(payloadShapeErrors({ ...base, taxExemptReason: value })).toEqual(['taxExemptReason: expected an object'])
  })
  it('R2 rejects an unknown key but accepts text alone', () => {
    expect(payloadShapeErrors({ ...base, taxExemptReason: { ...reason, note: 'note' } })).toEqual(['taxExemptReason.note: expected no unknown key'])
    expect(payloadShapeErrors({ ...base, taxExemptReason: { text: reason.text } })).toEqual([])
  })
  it.each([
    ...['', '   ', ' leading', 'trailing ', '\n', 1].map(value => ({ key: 'text', value })),
    ...['', ' x', 'x ', '   ', 1].map(value => ({ key: 'certificateId', value })),
  ])('R2 rejects invalid $key %#', ({ key, value }) => {
    expect(payloadShapeErrors({ ...base, taxExemptReason: { ...reason, [key]: value } })).toEqual([`taxExemptReason.${key}: expected a non-empty trimmed string`])
  })

  it('R3 accepts both fields at their UTF-16 limits', () => {
    expect(ORDER_TAX_EXEMPT_REASON_MAX).toBe(200)
    expect(ORDER_TAX_EXEMPT_CERTIFICATE_MAX).toBe(64)
    const body = { ...base, taxExemptReason: { text: '😀'.repeat(100), certificateId: '😀'.repeat(32) } }
    expect(payloadShapeErrors(body)).toEqual([])
    expect(payloadBoundErrors(body)).toEqual([])
    expect(precheckCommand(create(13, body), optional)).toBeUndefined()
  })
  it.each([['text', 200], ['certificateId', 64]] as const)('R3 refuses %s one unit past its bound', (key, max) => {
    const body = { ...base, taxExemptReason: { ...reason, [key]: '😀'.repeat(max / 2) + 'x' } }
    const message = `taxExemptReason.${key}: expected at most ${max} characters`
    expect(payloadBoundErrors(body)).toEqual([message])
    expect(precheckCommand(create(13, body), optional)).toEqual(refused(message))
  })
  it.each(['text', 'certificateId'])('R4 refuses a NUL in %s', key => {
    const body = { ...base, taxExemptReason: { ...reason, [key]: 'a\u0000b' } }
    expect(precheckCommand(create(13, body), optional)).toEqual(refused(`taxExemptReason.${key}: expected no NUL character`))
  })
  it.each([
    [base, server], [base, optional], [base, required],
    [nonExempt, server], [nonExempt, optional], [nonExempt, required],
  ] as const)('R5 refuses a reason on order.update %#', (body, supported) => {
    expect(precheckCommand(update({ ...body, taxExemptReason: reason }), supported)).toEqual(refused('taxExemptReason is not accepted on order.update'))
  })

  it('R6 refusals and validator errors never include the reason or certificate number', () => {
    const secret = { text: 'SECRETREASON', certificateId: 'CERTSECRET9' }
    const exempt = { ...base, taxExemptReason: secret }
    const ordinary = { ...nonExempt, taxExemptReason: secret }
    const malformed: OrderCreateTaxExemptReason[] = [
      { ...secret, text: secret.text.repeat(17) }, { ...secret, certificateId: secret.certificateId.repeat(6) },
      { ...secret, text: secret.text + '\u0000' }, { ...secret, certificateId: secret.certificateId + '\u0000' },
      { ...secret, text: ' SECRETREASON' },
    ]
    const cases = [
      [create(13, exempt), server], [create(12, exempt), optional], [create(13, ordinary), optional],
      [create(12, exempt), required], [create(13, exempt), invalid], [update(exempt), optional], [update(ordinary), optional],
      ...malformed.map(taxExemptReason => [create(13, { ...base, taxExemptReason }), optional] as const),
    ] as const
    for (const [command, supported] of cases) {
      const result = precheckCommand(command, supported)
      expect(result).not.toBeUndefined()
      for (const output of [result, payloadShapeErrors(command.payload), payloadBoundErrors(command.payload)]) {
        expect(JSON.stringify(output)).not.toContain(secret.text)
        expect(JSON.stringify(output)).not.toContain(secret.certificateId)
      }
    }
  })
})
