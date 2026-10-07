// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { OrderCreateCoupon, OrderCreatePayload } from '../types'
import { payloadBoundErrors, payloadShapeErrors } from './order-payload-shape'

const v5: OrderCreatePayload = {
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
}
const coupon: OrderCreateCoupon = { code: 'SAVE100', couponId: '1', discountMinor: 100, discountTaxMinor: 20 }
const line = { ...v5.lines[0], discountMinor: 150, regularUnitPriceMinor: 1200, attributes: { Size: 'Large' } }
const displayCoupon = { code: coupon.code, amountMinor: 100 }
const v6 = {
  ...v5, lines: [line], discountMinor: 150, taxMinor: 174, totalMinor: 1044,
  coupons: [coupon, { code: 'SAVE50', couponId: '2', discountMinor: 50, discountTaxMinor: 10 }],
  payments: [{ clientPaymentId: 'payment', method: 'cash', amountMinor: 1044 }],
  display: { ...v5.display!, discountMinor: 150, taxMinor: 174, totalMinor: 1044,
    coupons: [displayCoupon, { code: 'SAVE50', amountMinor: 50 }] },
  taxByRate: [{ ratePpm: 200000, netMinor: 870, taxMinor: 174, grossMinor: 1044 }],
} satisfies OrderCreatePayload

describe('order.create v6 (coupons, ADR-077)', () => {
  it('accepts coupons, recorded regular price and attributes, and receipt coupon rows', () => {
    expect(payloadShapeErrors(v6)).toEqual([])
    expect(payloadBoundErrors(v6)).toEqual([])
  })

  it.each([
    [{ coupons: {} }, 'coupons: expected an array'],
    [{ coupons: [null] }, 'coupons[0]: expected an object'],
    [{ coupons: [{ ...coupon, extra: true }] }, 'coupons[0].extra: expected no unknown key'],
    [{ coupons: [{ ...coupon, code: '' }] }, 'coupons[0].code: expected a non-empty string'],
    [{ coupons: [{ ...coupon, couponId: '' }] }, 'coupons[0].couponId: expected a non-empty string'],
    [{ coupons: [{ ...coupon, discountMinor: -1 }] }, 'coupons[0].discountMinor: expected a safe integer >= 0'],
    [{ coupons: [{ ...coupon, discountTaxMinor: 1.5 }] }, 'coupons[0].discountTaxMinor: expected a safe integer >= 0'],
    [{ coupons: [{ ...coupon, discountMinor: Number.MAX_SAFE_INTEGER + 1 }] }, 'coupons[0].discountMinor: expected a safe integer >= 0'],
    [{ coupons: [coupon, { ...coupon, couponId: '2' }] }, 'coupons[1].code: expected no duplicate code'],
    [{ lines: [{ ...line, regularUnitPriceMinor: -1 }] }, 'lines[0].regularUnitPriceMinor: expected a safe integer >= 0'],
    [{ lines: [{ ...line, regularUnitPriceMinor: 1.5 }] }, 'lines[0].regularUnitPriceMinor: expected a safe integer >= 0'],
    [{ lines: [{ ...line, attributes: [] }] }, 'lines[0].attributes: expected an object'],
    [{ lines: [{ ...line, attributes: null }] }, 'lines[0].attributes: expected an object'],
    [{ lines: [{ ...line, attributes: { Size: 42 } }] }, 'lines[0].attributes.Size: expected a string'],
    [{ display: { ...v6.display, coupons: {} } }, 'display.coupons: expected an array'],
    [{ display: { ...v6.display, coupons: [null] } }, 'display.coupons[0]: expected an object'],
    [{ display: { ...v6.display, coupons: [{ ...displayCoupon, code: '' }] } }, 'display.coupons[0].code: expected a non-empty string'],
    [{ display: { ...v6.display, coupons: [{ ...displayCoupon, extra: true }] } }, 'display.coupons[0].extra: expected no unknown key'],
    [{ display: { ...v6.display, coupons: [{ ...displayCoupon, amountMinor: 1.5 }] } }, 'display.coupons[0].amountMinor: expected a safe integer >= 0'],
  ])('checks malformed v6 fields %j', (patch, expected) => {
    expect(payloadShapeErrors({ ...v6, ...patch })).toEqual([expected])
  })

  it.each([
    [{ coupons: [{ ...coupon, code: 'x'.repeat(256) }] }, 'coupons[0].code: expected at most 255 characters'],
    [{ coupons: [{ ...coupon, couponId: 'x'.repeat(65) }] }, 'coupons[0].couponId: expected at most 64 characters'],
    [{ lines: [{ ...line, attributes: { ['x'.repeat(256)]: 'Large' } }] }, 'lines[0].attributes: expected at most 255 characters'],
    [{ lines: [{ ...line, attributes: { Size: 'x'.repeat(256) } }] }, 'lines[0].attributes.Size: expected at most 255 characters'],
    [{ display: { ...v6.display, coupons: [{ ...displayCoupon, code: 'x'.repeat(256) }] } }, 'display.coupons[0].code: expected at most 255 characters'],
  ])('bounds v6 strings %j', (patch, expected) => {
    expect(payloadBoundErrors({ ...v6, ...patch })).toEqual([expected])
  })

  it.each([
    [{ coupons: [{ ...coupon, code: '\u0000' }] }, 'coupons[0].code'],
    [{ coupons: [{ ...coupon, couponId: '\u0000' }] }, 'coupons[0].couponId'],
    [{ lines: [{ ...line, attributes: { ['\u0000']: 'Large' } }] }, 'lines[0].attributes'],
    [{ lines: [{ ...line, attributes: { Size: '\u0000' } }] }, 'lines[0].attributes.Size'],
    [{ display: { ...v6.display, coupons: [{ ...displayCoupon, code: '\u0000' }] } }, 'display.coupons[0].code'],
  ])('rejects NUL in v6 strings %j', (patch, path) => {
    expect(payloadShapeErrors({ ...v6, ...patch })).toEqual([`${path}: expected no NUL character`])
  })

  it('accepts zero figures and strings at their bounds', () => {
    const payload = { ...v6,
      coupons: [{ code: 'x'.repeat(255), couponId: 'x'.repeat(64), discountMinor: 0, discountTaxMinor: 0 }],
      lines: [{ ...line, regularUnitPriceMinor: 0, attributes: { ['x'.repeat(255)]: 'x'.repeat(255) } }],
      display: { ...v6.display, coupons: [{ code: 'x'.repeat(255), amountMinor: 0 }] },
    }
    expect(payloadShapeErrors(payload)).toEqual([])
    expect(payloadBoundErrors(payload)).toEqual([])
  })

  it('caps errors at ten and retains earlier errors before the v6 checks', () => {
    const coupons = Array.from({ length: 12 }, (_, index) => ({ ...coupon, code: `coupon${index}`, discountMinor: -1 }))
    expect(payloadShapeErrors({ ...v6, currency: 42, coupons })).toEqual([
      'currency: expected a string',
      ...coupons.slice(0, 9).map((_, index) => `coupons[${index}].discountMinor: expected a safe integer >= 0`),
    ])
  })

  it('still accepts a v5 payload without v6 fields', () => {
    expect(payloadShapeErrors(v5)).toEqual([])
    expect(payloadBoundErrors(v5)).toEqual([])
  })
})
