// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { OrderCreatePayload } from '../types'
import { precheckCommand } from './batch'
import { payloadBoundErrors, payloadShapeErrors } from './order-payload-shape'

const supported = { orderCreate: [1, 2, 3, 4, 5, 6, 7, 8], register: [1] }
const v8: OrderCreatePayload = {
  clientOrderId: 'order', createdAt: '2026-11-11T10:00:00.000Z', currency: 'USD', pricesIncludeTax: false,
  lines: [{ clientLineId: 'line', variantId: 'variant', quantity: 1, unitPriceMinor: 1000 }],
  subtotalMinor: 1000, taxMinor: 40, totalMinor: 1040,
  payments: [{ clientPaymentId: 'payment', method: 'cash', amountMinor: 1040 }],
  display: { currency: 'USD', exponent: 2, taxInclusive: false, subtotalMinor: 1000, discountMinor: 0,
    taxMinor: 40, totalMinor: 1040, orderDiscountMinor: 0, lines: [{ clientLineId: 'line', amountMinor: 1000, discounts: [] }] },
  taxByRate: [{ ratePpm: 40000, netMinor: 1000, taxMinor: 40, grossMinor: 1040 }],
  customer: {
    email: 'ann@example.com', customerId: '7',
    billing: { firstName: 'Ann', lastName: 'Lee', address1: '1 Main St', city: 'Albany', state: 'NY', postcode: '12207', country: 'US' },
    shipping: { city: 'Portland', state: 'OR', country: 'US' },
  },
  taxAddress: 'billing',
  note: 'Leave at the door',
}
const command = (version: number, payload: unknown) =>
  precheckCommand({ id: 'command', type: 'order.create', version, payload } as never, supported)
const rejected = (message: string) => ({ status: 'rejected', error: { code: 'invalid_payload', message } })
const { taxAddress: _taxAddress, ...withoutTaxAddress } = v8
const { billing: _billing, shipping: _shipping, ...customer } = v8.customer!

describe('order.create v8 (tax address, #722)', () => {
  it.each(['billing', 'shipping'] as const)('accepts a payload taxed on the %s address', (taxAddress) => {
    const payload = { ...v8, taxAddress }
    expect(payloadShapeErrors(payload)).toEqual([])
    expect(payloadBoundErrors(payload)).toEqual([])
    expect(command(8, payload)).toBeUndefined()
  })

  it('refuses v8 when the server does not advertise it', () => {
    expect(precheckCommand({ id: 'command', type: 'order.create', version: 8, payload: v8 },
      { orderCreate: [1, 2, 3, 4, 5, 6, 7], register: [1] })).toMatchObject({
      status: 'rejected', error: { code: 'unsupported_version', data: { orderCreate: 7 } },
    })
  })

  it.each([7, 6, 3])('refuses taxAddress at version %s', (version) => {
    expect(command(version, { ...v8, note: undefined })).toMatchObject(rejected('taxAddress requires version 8'))
  })

  it.each([['billing'], ['shipping']])('refuses a customer %s address below version 8', (kind) => {
    const payload = { ...withoutTaxAddress, note: undefined, customer: { ...customer, [kind]: { country: 'US' } } }
    expect(command(7, payload)).toMatchObject(rejected('customer address requires version 8'))
  })

  it('refuses version 8 without taxAddress', () => {
    expect(command(8, withoutTaxAddress)).toMatchObject(rejected('version 8 requires taxAddress'))
  })

  it.each(['base', '', 5])('refuses taxAddress %j', (taxAddress) => {
    expect(command(8, { ...v8, taxAddress })).toMatchObject(rejected('taxAddress: expected billing or shipping'))
  })

  it.each([
    ['without the taxed address', { ...customer, shipping: v8.customer!.shipping }],
    ['with an empty country', { ...customer, billing: { ...v8.customer!.billing, country: '' } }],
    ['without a customer', null],
  ])('refuses the taxed address %s', (_label, value) => {
    expect(command(8, { ...v8, customer: value })).toMatchObject(rejected('customer.billing.country: expected a non-empty string'))
  })

  it('refuses an address that is not an object, an unknown key and a non-string field', () => {
    expect(payloadShapeErrors({ ...v8, customer: { ...v8.customer, shipping: 'Portland' } }))
      .toEqual(['customer.shipping: expected an object'])
    expect(payloadShapeErrors({ ...v8, customer: { ...v8.customer, billing: { ...v8.customer!.billing, email: 'a@b.c' } } }))
      .toEqual(['customer.billing.email: expected no unknown key'])
    expect(command(8, { ...v8, customer: { ...v8.customer, shipping: { country: 'US', postcode: 97201 } } }))
      .toMatchObject(rejected('customer.shipping.postcode: expected a string'))
  })

  it('bounds each address field at 255 UTF-16 units and refuses a NUL', () => {
    const at = (city: string) => ({ ...v8, customer: { ...v8.customer, shipping: { country: 'US', city } } })
    expect(payloadBoundErrors(at('x'.repeat(255)))).toEqual([])
    expect(command(8, at('x'.repeat(256)))).toMatchObject(rejected('customer.shipping.city: expected at most 255 characters'))
    expect(command(8, at('Port\u0000land'))).toMatchObject(rejected('customer.shipping.city: expected no NUL character'))
  })
})
