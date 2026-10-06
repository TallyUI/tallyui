// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { OrderCreateEnvelope, OrderCreatePayload } from '../types'
import { precheckCommand, validateBatch } from './batch'
import { fiscalFiguresErrors } from './fiscal-figures'
import { payloadBoundErrors, payloadShapeErrors } from './order-payload-shape'

const supported = { orderCreate: [1, 2, 3, 4, 5], register: [1] }
const createdAt = '2026-10-06T10:00:00.000Z'
// Handoff §3.1 and §3.2, with createdAt supplied (the examples abbreviate v4 fields).
const fee: OrderCreatePayload = {
  clientOrderId: '0199b0a0-0000-7000-8000-0000000000a1', createdAt, currency: 'EUR', pricesIncludeTax: false,
  lines: [{ clientLineId: '0199b0a0-0000-7000-8000-0000000000b1', variantId: 'var_123', title: 'Coffee beans',
    quantity: 1, unitPriceMinor: 1000 }],
  fees: [{ clientFeeId: '0199b0a0-0000-7000-8000-0000000000f1', name: 'Bag', amountMinor: 20,
    taxStatus: 'taxable', taxMinor: 4 }],
  subtotalMinor: 1000, taxMinor: 204, totalMinor: 1224,
  payments: [{ clientPaymentId: '0199b0a0-0000-7000-8000-0000000000c1', method: 'cash', amountMinor: 1224 }],
  display: { currency: 'EUR', exponent: 2, taxInclusive: false, subtotalMinor: 1000, discountMinor: 0,
    taxMinor: 204, totalMinor: 1224, orderDiscountMinor: 0,
    lines: [{ clientLineId: '0199b0a0-0000-7000-8000-0000000000b1', amountMinor: 1000, discounts: [] }],
    fees: [{ clientFeeId: '0199b0a0-0000-7000-8000-0000000000f1', amountMinor: 20 }] },
  taxByRate: [{ ratePpm: 200000, netMinor: 1020, taxMinor: 204, grossMinor: 1224 }],
}
const shipping: OrderCreatePayload = {
  clientOrderId: '0199b0a0-0000-7000-8000-0000000000a2', createdAt, currency: 'EUR', pricesIncludeTax: false,
  lines: [
    { clientLineId: '0199b0a0-0000-7000-8000-0000000000b2', variantId: 'var_456', title: 'Scarf', quantity: 1, unitPriceMinor: 2500 },
    { clientLineId: '0199b0a0-0000-7000-8000-0000000000b3', title: 'Gift wrap', quantity: 1, unitPriceMinor: 300,
      custom: { name: 'Gift wrap', taxStatus: 'none' } },
  ],
  shipping: [{ clientShippingId: '0199b0a0-0000-7000-8000-0000000000d1', name: 'Local delivery', methodId: 'flat_rate',
    amountMinor: 500, taxStatus: 'taxable', taxMinor: 100 }],
  subtotalMinor: 2800, taxMinor: 600, totalMinor: 3900,
  payments: [{ clientPaymentId: '0199b0a0-0000-7000-8000-0000000000c2', method: 'external', amountMinor: 3900 }],
  display: { currency: 'EUR', exponent: 2, taxInclusive: false, subtotalMinor: 2800, discountMinor: 0,
    taxMinor: 600, totalMinor: 3900, orderDiscountMinor: 0,
    lines: [{ clientLineId: '0199b0a0-0000-7000-8000-0000000000b2', amountMinor: 2500, discounts: [] },
      { clientLineId: '0199b0a0-0000-7000-8000-0000000000b3', amountMinor: 300, discounts: [] }],
    shipping: [{ clientShippingId: '0199b0a0-0000-7000-8000-0000000000d1', amountMinor: 500 }] },
  taxByRate: [{ ratePpm: 200000, netMinor: 3000, taxMinor: 600, grossMinor: 3600 },
    { ratePpm: 0, netMinor: 300, taxMinor: 0, grossMinor: 300 }],
}
const envelope = (payload: OrderCreatePayload, version: OrderCreateEnvelope['version'] = 5): OrderCreateEnvelope => ({
  id: payload === shipping ? '0199b0a0-0000-7000-8000-000000000002' : '0199b0a0-0000-7000-8000-000000000001',
  type: 'order.create', version, payload, createdAt, deviceId: 'till', attempt: 1,
})

describe('order.create v5 (ADR-075)', () => {
  it.each([['fee', fee], ['shipping and custom', shipping]] as const)('accepts the golden %s pair', (_, payload) => {
    const command = envelope(payload)
    expect(validateBatch({ commands: [command] })).toEqual({ ok: true, commands: [command] })
    expect(payloadShapeErrors(payload)).toEqual([])
    expect(payloadBoundErrors(payload)).toEqual([])
    expect(fiscalFiguresErrors(payload)).toEqual([])
    expect(precheckCommand(command, supported)).toBeUndefined()
  })

  it.each([1, 2, 3, 4] as const)('refuses all v5 fields below v5 (version %s)', version => {
    expect(precheckCommand(envelope(fee, version), supported)).toMatchObject({ error: {
      code: 'invalid_payload', message: expect.stringContaining('fees requires version 5'),
    } })
    const result = precheckCommand(envelope(shipping, version), supported)
    expect(result?.error?.code).toBe('invalid_payload')
    expect(result?.error?.message).toContain('shipping requires version 5')
    expect(result?.error?.message).toContain('lines[1].custom requires version 5')
    for (const field of ['fees', 'shipping'] as const) {
      const payload = structuredClone(fee)
      delete payload.fees
      delete payload.display!.fees
      payload.display = { ...payload.display!, [field]: [] }
      expect(precheckCommand(envelope(payload, version), supported)?.error?.message).toContain(`display.${field} requires version 5`)
    }
  })

  it.each([fee, shipping])('refuses v5 when the server no longer advertises it', payload => {
    expect(precheckCommand(envelope(payload), { orderCreate: [1, 2, 3, 4], register: [1] })).toMatchObject({
      error: { code: 'unsupported_version', data: { orderCreate: 4 } },
    })
  })

  const malformed: Array<[string, OrderCreatePayload, (payload: OrderCreatePayload) => void]> = [
    ['fees[0].amountMinor', fee, p => { p.fees![0].amountMinor = -1 }],
    ['fees[0].amountMinor', fee, p => { p.fees![0].amountMinor = 0.5 }],
    ['fees[0].extra', fee, p => { Object.assign(p.fees![0], { extra: true }) }],
    ['fees[1].clientFeeId', fee, p => { p.fees!.push({ ...p.fees![0] }) }],
    ['lines[1] has custom and variantId; a custom line has no variantId', shipping, p => { p.lines[1].variantId = 'var_1' }],
    ['lines[0].variantId is required', fee, p => { delete p.lines[0].variantId }],
    ['fees[0].taxStatus', fee, p => { Object.assign(p.fees![0], { taxStatus: 'shipping' }) }],
    ['display.fees[0].clientFeeId', fee, p => { p.display!.fees![0].clientFeeId = 'unmatched' }],
    ['display.fees[0].amountMinor', fee, p => { p.display!.fees![0].amountMinor += 1 }],
    ['display.fees[1].clientFeeId', fee, p => { p.display!.fees!.push({ ...p.display!.fees![0] }) }],
    ['display.fees', fee, p => { delete p.display!.fees }],
    ['display.shipping[0].amountMinor', shipping, p => { p.display!.shipping![0].amountMinor += 1 }],
    ['display.shipping', shipping, p => { delete p.display!.shipping }],
    ['shipping[1].clientShippingId', shipping, p => { p.shipping!.push({ ...p.shipping![0] }) }],
    ['display.taxInclusive', fee, p => { p.display!.taxInclusive = true }],
    ['display.taxInclusive', shipping, p => { p.display!.taxInclusive = true }],
    ['display.totalMinor', fee, p => { p.display!.totalMinor += 1 }],
    ['taxByRate', fee, p => { p.taxByRate![0].taxMinor += 1 }],
    ['taxByRate[0].grossMinor', fee, p => { p.taxByRate![0].grossMinor += 1 }],
    ['lines[1].custom.extra', shipping, p => { Object.assign(p.lines[1].custom!, { extra: true }) }],
    ['lines[1].custom.taxStatus', shipping, p => { Object.assign(p.lines[1].custom!, { taxStatus: 'shipping' }) }],
  ]
  it.each(malformed)('refuses malformed v5 at %s', (path, original, mutate) => {
    const payload = structuredClone(original)
    mutate(payload)
    expect(precheckCommand(envelope(payload), supported)).toMatchObject({ status: 'rejected', error: {
      code: 'invalid_payload', message: expect.stringContaining(path),
    } })
  })

  it.each([1, 2, 3, 4, 5] as const)('requires a non-empty catalogue variantId at version %s', version => {
    const payload = structuredClone(fee)
    delete payload.fees
    delete payload.display
    delete payload.taxByRate
    if (version === 2) { payload.discountMinor = 1; payload.lines[0].discountMinor = 1 }
    for (const variantId of [undefined, '', null, 42]) {
      Object.assign(payload.lines[0], { variantId })
      expect(precheckCommand(envelope(payload, version), supported)?.error?.message).toBe('lines[0].variantId is required')
    }
  })

  it('allows inclusive charges with matching gross display amounts', () => {
    const payload = structuredClone(fee)
    payload.pricesIncludeTax = payload.display!.taxInclusive = true
    payload.lines[0].unitPriceMinor = payload.display!.lines[0].amountMinor = 1200
    payload.display!.subtotalMinor = 1200
    payload.fees![0].amountMinor = payload.display!.fees![0].amountMinor = 24
    expect(precheckCommand(envelope(payload), supported)).toBeUndefined()
  })

  it('retains v3 fields and the v4 discount sum check in v5', () => {
    const payload = structuredClone(shipping)
    payload.customer = { customerId: 'customer' }
    payload.sessionId = 'session'
    payload.discountMinor = payload.lines[1].discountMinor = 100
    payload.totalMinor = payload.display!.totalMinor = payload.payments[0].amountMinor = 3800
    payload.display!.discountMinor = 100
    payload.taxByRate![1].netMinor = payload.taxByRate![1].grossMinor = 200
    expect(precheckCommand(envelope(payload), supported)).toBeUndefined()
    payload.discountMinor = 101
    expect(precheckCommand(envelope(payload), supported)?.error?.message).toContain('discountMinor: expected the sum of lines[].discountMinor')
  })

  it('does not require display and adds no subtotal-to-total identity', () => {
    const payload = structuredClone(fee)
    payload.subtotalMinor = payload.display!.subtotalMinor = 1
    expect(precheckCommand(envelope(payload), supported)).toBeUndefined()
    delete payload.display
    delete payload.taxByRate
    expect(precheckCommand(envelope(payload), supported)).toBeUndefined()
  })

  it.each(['fees', 'shipping', 'custom'] as const)('checks %s objects, types and bounds', field => {
    const original = field === 'fees' ? fee : shipping
    const get = (p: OrderCreatePayload): Record<string, unknown> =>
      (field === 'custom' ? p.lines[1].custom : p[field]![0]) as unknown as Record<string, unknown>
    const stringBounds: Array<[string, number]> = [['name', 255], ['taxClass', 64]]
    if (field === 'custom') stringBounds.push(['sku', 64])
    else stringBounds.push([field === 'fees' ? 'clientFeeId' : 'clientShippingId', 36])
    if (field === 'shipping') stringBounds.push(['methodId', 64])
    const path = field === 'custom' ? 'lines[1].custom' : `${field}[0]`
    for (const [key, max] of stringBounds) {
      const payload = structuredClone(original)
      get(payload)[key] = 'x'.repeat(max)
      expect(payloadShapeErrors(payload)).toEqual([])
      expect(payloadBoundErrors(payload)).toEqual([])
      get(payload)[key] = 'x'.repeat(max + 1)
      expect(payloadBoundErrors(payload)).toEqual([`${path}.${key}: expected at most ${max} characters`])
      get(payload)[key] = 42
      expect(payloadShapeErrors(payload).some(error => error.startsWith(`${path}.${key}:`))).toBe(true)
      get(payload)[key] = '\u0000'
      expect(payloadShapeErrors(payload)).toContain(`${path}.${key}: expected no NUL character`)
    }
    for (const key of ['name', ...(field === 'custom' ? [] : [field === 'fees' ? 'clientFeeId' : 'clientShippingId'])]) {
      const payload = structuredClone(original)
      get(payload)[key] = ''
      expect(payloadShapeErrors(payload)).toContain(`${path}.${key}: expected a non-empty string`)
    }
    if (field !== 'custom') for (const key of ['amountMinor', 'taxMinor']) for (const value of [-1, 0.5, '1', null]) {
      const payload = structuredClone(original)
      get(payload)[key] = value
      expect(payloadShapeErrors(payload)).toContain(`${path}.${key}: expected a safe integer >= 0`)
    }
    for (const value of [null, [], 'invalid']) {
      const payload = structuredClone(original)
      if (field === 'custom') Object.assign(payload.lines[1], { custom: value })
      else Object.assign(payload, { [field]: [value] })
      expect(payloadShapeErrors(payload)).toContain(`${path}: expected an object`)
    }
  })

  it.each(['fees', 'shipping'] as const)('checks display.%s row shapes', field => {
    const original = field === 'fees' ? fee : shipping
    const id = field === 'fees' ? 'clientFeeId' : 'clientShippingId'
    for (const [key, value] of [[id, ''], [id, 42], ['amountMinor', 0.5], ['extra', true]] as const) {
      const payload = structuredClone(original)
      Object.assign(payload.display![field]![0], { [key]: value })
      expect(precheckCommand(envelope(payload), supported)?.error?.message).toContain(`display.${field}[0].${key}`)
    }
    const payload = structuredClone(original)
    Object.assign(payload.display![field]![0], { [id]: 'x'.repeat(37) })
    expect(payloadBoundErrors(payload)).toEqual([`display.${field}[0].${id}: expected at most 36 characters`])
  })
})
