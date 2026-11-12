// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { OrderCreatePayload } from '../types'
import { precheckCommand } from './batch'
import { payloadBoundErrors, payloadShapeErrors } from './order-payload-shape'

const supported = { orderCreate: [1, 2, 3, 4, 5, 6, 7, 8, 9], register: [1] }
const v9: OrderCreatePayload = {
  clientOrderId: 'order', createdAt: '2026-11-12T10:00:00.000Z', currency: 'EUR', pricesIncludeTax: true,
  lines: [{ clientLineId: 'l1', variantId: 'variant', quantity: 1, unitPriceMinor: 1190, discountMinor: 100 }],
  discountMinor: 100, subtotalMinor: 816, taxMinor: 155, totalMinor: 971,
  payments: [{ clientPaymentId: 'payment', method: 'cash', amountMinor: 971 }],
  coupons: [{ code: 'c', couponId: 'promo_1', discountMinor: 84, discountTaxMinor: 16,
    lines: [{ clientLineId: 'l1', discountMinor: 84, discountTaxMinor: 16 }] }],
}
const coupon = v9.coupons![0]!
const line = coupon.lines![0]!
const { lines: _lines, ...withoutLines } = coupon
const v9two: OrderCreatePayload = {
  ...v9,
  lines: [v9.lines[0]!, { ...v9.lines[0]!, clientLineId: 'l2' }],
  discountMinor: 200, subtotalMinor: 1632, taxMinor: 310, totalMinor: 1942,
  payments: [{ ...v9.payments[0]!, amountMinor: 1942 }],
  coupons: [
    { ...coupon, lines: [{ ...line, discountMinor: 42, discountTaxMinor: 8 },
      { clientLineId: 'l2', discountMinor: 42, discountTaxMinor: 8 }] },
    { ...coupon, code: 'd', couponId: 'promo_2', lines: [{ ...line, discountMinor: 42, discountTaxMinor: 8 },
      { clientLineId: 'l2', discountMinor: 42, discountTaxMinor: 8 }] },
  ],
}
const command = (version: number, payload: unknown) =>
  precheckCommand({ id: 'command', type: 'order.create', version, payload } as never, supported)
const rejected = (message: string) => ({ id: 'command', status: 'rejected', error: { code: 'invalid_payload', message } })

describe('order.create v9 (coupon lines, #790)', () => {
  it.each([
    ['the worked example without taxAddress', v9],
    ['two lines and two coupons', v9two],
    ['a billing tax address', { ...v9, taxAddress: 'billing', customer: { billing: { country: 'DE' } } }],
    ['a zero coupon with no line shares', { ...v9, coupons: [coupon,
      { code: 'zero', couponId: 'promo_zero', discountMinor: 0, discountTaxMinor: 0, lines: [] }] }],
  ])('accepts %s', (_label, payload) => {
    expect(payloadShapeErrors(payload)).toEqual([])
    expect(payloadBoundErrors(payload)).toEqual([])
    expect(command(9, payload)).toEqual(undefined)
  })

  it('still requires taxAddress at 8, and accepts 9 without coupons or taxAddress', () => {
    expect(command(8, { ...v9, coupons: [withoutLines] })).toEqual(rejected('version 8 requires taxAddress'))
    const { coupons: _coupons, ...withoutCoupons } = v9
    expect(command(9, withoutCoupons)).toEqual(undefined)
  })

  it.each([
    ['a billing address', { billing: { country: 'DE' } }],
    ['a shipping address', { shipping: { country: 'DE' } }],
  ])('refuses %s without taxAddress at 9', (_label, customer) => {
    expect(command(9, { ...v9, customer })).toEqual(rejected('version 9 customer address requires taxAddress'))
  })

  it.each([
    ['no address', { ...v9, taxAddress: 'billing' }],
    ['an empty country', { ...v9, taxAddress: 'billing', customer: { billing: { country: '' } } }],
    ['only the other address', { ...v9, taxAddress: 'shipping', customer: { billing: { country: 'DE' } } }],
  ])('a v9 taxAddress still needs its address country: %s', (_label, payload) => {
    expect(command(9, payload)).toEqual(rejected(`customer.${payload.taxAddress}.country: expected a non-empty string`))
  })

  it.each([
    [6, v9],
    [7, v9],
    [8, { ...v9, taxAddress: 'billing', customer: { billing: { country: 'DE' } } }],
  ])('refuses coupon lines at version %s', (version, payload) => {
    expect(command(version as number, payload)).toEqual(rejected('coupons[].lines requires version 9'))
  })

  it('requires every coupon to carry lines at 9', () => {
    expect(command(9, { ...v9, coupons: [withoutLines] })).toEqual(rejected('version 9 requires coupons[].lines'))
  })

  it.each([
    ['lines not an array', { ...v9, coupons: [{ ...coupon, lines: null }] },
      ['coupons[0].lines: expected an array']],
    ['entry not an object', { ...v9, coupons: [{ ...coupon, lines: [null] }] },
      ['coupons[0].lines[0]: expected an object']],
    ['unknown entry key', { ...v9, coupons: [{ ...coupon, lines: [{ ...line, extra: true }] }] },
      ['coupons[0].lines[0].extra: expected no unknown key']],
    ['unknown clientLineId', { ...v9, coupons: [{ ...coupon, lines: [{ ...line, clientLineId: 'missing' }] }] },
      ['coupons[0].lines[0].clientLineId: expected a payload lines[].clientLineId']],
    ['non-string clientLineId', { ...v9, coupons: [{ ...coupon, lines: [{ ...line, clientLineId: 1 }] }] },
      ['coupons[0].lines[0].clientLineId: expected a payload lines[].clientLineId']],
    ['duplicate also breaks payload order', { ...v9, coupons: [{ ...coupon, lines: [
      { ...line, discountMinor: 42, discountTaxMinor: 8 }, { ...line, discountMinor: 42, discountTaxMinor: 8 },
    ] }] }, [
      'coupons[0].lines[1].clientLineId: expected no duplicate clientLineId',
      'coupons[0].lines[1].clientLineId: expected payload lines order',
    ]],
    ['out of payload order', { ...v9two, coupons: [
      { ...v9two.coupons![0]!, lines: [...v9two.coupons![0]!.lines!].reverse() }, v9two.coupons![1]!,
    ] }, ['coupons[0].lines[1].clientLineId: expected payload lines order']],
    ['negative discountMinor', { ...v9, coupons: [{ ...coupon, lines: [{ ...line, discountMinor: -1 }] }] },
      ['coupons[0].lines[0].discountMinor: expected a safe integer >= 0']],
    ['non-integer discountMinor', { ...v9, coupons: [{ ...coupon, lines: [{ ...line, discountMinor: 1.5 }] }] },
      ['coupons[0].lines[0].discountMinor: expected a safe integer >= 0']],
    ['negative discountTaxMinor', { ...v9, coupons: [{ ...coupon, lines: [{ ...line, discountTaxMinor: -1 }] }] },
      ['coupons[0].lines[0].discountTaxMinor: expected a safe integer >= 0']],
    ['non-integer discountTaxMinor', { ...v9, coupons: [{ ...coupon, lines: [{ ...line, discountTaxMinor: 1.5 }] }] },
      ['coupons[0].lines[0].discountTaxMinor: expected a safe integer >= 0']],
    ['zero entry', { ...v9, coupons: [{ ...coupon, discountMinor: 0, discountTaxMinor: 0,
      lines: [{ ...line, discountMinor: 0, discountTaxMinor: 0 }] }] },
    ['coupons[0].lines[0]: expected a non-zero discountMinor or discountTaxMinor']],
    ['discount sum off by 1', { ...v9, coupons: [{ ...coupon, lines: [{ ...line, discountMinor: 85 }] }] },
      ['coupons[0].lines: expected discountMinor summing to coupons[0].discountMinor']],
    ['tax sum off by 1', { ...v9, coupons: [{ ...coupon, lines: [{ ...line, discountTaxMinor: 17 }] }] },
      ['coupons[0].lines: expected discountTaxMinor summing to coupons[0].discountTaxMinor']],
    ['second coupon without lines', { ...v9, coupons: [coupon, { ...withoutLines, code: 'd' }] },
      ['coupons[1].lines: expected an array']],
    ['display coupon lines remain unknown', { ...v9, display: { coupons: [{ code: 'c', amountMinor: 100, lines: [] }] } },
      ['display.coupons[0].lines: expected no unknown key']],
    ['NUL clientLineId also gives an unknown id', { ...v9, coupons: [{ ...coupon, lines: [{ ...line, clientLineId: 'l\u00001' }] }] }, [
      'coupons[0].lines[0].clientLineId: expected a payload lines[].clientLineId',
      'coupons[0].lines[0].clientLineId: expected no NUL character',
    ]],
  ])('shape: %s', (_label, payload, errors) => {
    expect(payloadShapeErrors(payload)).toEqual(errors)
  })

  it('bounds coupon lines by the payload line count', () => {
    expect(payloadBoundErrors({ ...v9, coupons: [{ ...coupon, lines: [line, line] }] }))
      .toEqual(['coupons[0].lines: expected at most 1 entries'])
  })

  it('bounds clientLineId at 255 and reports the unknown id in shape checks', () => {
    const payload = { ...v9, coupons: [{ ...coupon, lines: [{ ...line, clientLineId: 'x'.repeat(256) }] }] }
    expect(payloadBoundErrors(payload)).toEqual(['coupons[0].lines[0].clientLineId: expected at most 255 characters'])
    expect(payloadShapeErrors(payload)).toEqual(['coupons[0].lines[0].clientLineId: expected a payload lines[].clientLineId'])
  })
})
