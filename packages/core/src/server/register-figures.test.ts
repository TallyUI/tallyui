// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { deriveSessionFigures, deriveVariance } from './register-figures'

const workedExample: Parameters<typeof deriveSessionFigures>[0] = {
  countedFloatMinor: 10000,
  orders: [{ payments: [{ method: 'cash', amountMinor: 3256, ...{ tenderedMinor: 4000, changeMinor: 744 } }] }],
  movements: [
    { id: 'in', type: 'paid_in', amountMinor: 2000, voids: null },
    { id: 'out', type: 'paid_out', amountMinor: 500, voids: null },
    { id: 'voided-out', type: 'paid_out', amountMinor: 700, voids: null },
    { id: 'void', type: 'void', amountMinor: 700, voids: 'voided-out' },
  ],
}

describe('session figures', () => {
  it('malformed payments are skipped and never throw', () => {
    const orders = [{ payments: null }, { payments: {} }, { payments: [
      null, { amountMinor: 500 }, { method: '', amountMinor: 500 }, { method: 1, amountMinor: 500 },
      { method: 'cash', amountMinor: '500' }, { method: 'cash', amountMinor: 1.5 },
      { method: 'cash', amountMinor: Number.MAX_SAFE_INTEGER + 1 },
      { method: 'cash', amountMinor: NaN }, { method: 'cash', amountMinor: Infinity },
      { method: 'cash', amountMinor: 500 }, { method: 'external', amountMinor: 1500 },
    ] }] as unknown as typeof workedExample.orders
    expect(deriveSessionFigures({ countedFloatMinor: 100, orders, movements: [] }))
      .toEqual({ expected: { cash: 600, external: 1500 }, salesCount: 3 })
  })

  it('a method named constructor is an ordinary key', () => {
    const figures = deriveSessionFigures({ countedFloatMinor: 100, movements: [], orders: [{ payments: [
      { method: 'constructor', amountMinor: 500 }, { method: 'constructor', amountMinor: 200 },
      { method: 'toString', amountMinor: 300 }, { method: '__proto__', amountMinor: 400 },
    ] }] })
    expect(figures.expected).toEqual({ cash: 100, constructor: 700, toString: 300, ['__proto__']: 400 })
    expect(Object.keys(figures.expected)).toEqual(['cash', 'constructor', 'toString', '__proto__'])
    expect(Object.getPrototypeOf(figures.expected)).toBe(Object.prototype)
  })

  it('matches the worked example using the v3 cash amount net of change', () => {
    const figures = deriveSessionFigures(workedExample)
    expect(figures).toEqual({ expected: { cash: 14756 }, salesCount: 1 })
    expect(deriveVariance({ cash: 14700 }, figures.expected)).toEqual({ cash: -56 })
  })

  it('adds a second external order and keeps variance over counted keys only', () => {
    const figures = deriveSessionFigures({ ...workedExample, orders: [
      ...workedExample.orders, { payments: [{ method: 'external', amountMinor: 1500 }] },
    ] })
    expect(figures).toEqual({ expected: { cash: 14756, external: 1500 }, salesCount: 2 })
    expect(Object.keys(figures.expected)).toEqual(['cash', 'external'])
    expect(deriveVariance({ cash: 14700 }, figures.expected)).toEqual({ cash: -56 })
  })

  it('keeps cash present for a zero float with no orders', () => {
    expect(deriveSessionFigures({ countedFloatMinor: 0, orders: [], movements: [] }))
      .toEqual({ expected: { cash: 0 }, salesCount: 0 })
  })

  it('excludes a void target even when the void comes first', () => {
    expect(deriveSessionFigures({ countedFloatMinor: 0, orders: [], movements: [
      { id: 'void', type: 'void', amountMinor: 500, voids: 'in' },
      { id: 'in', type: 'paid_in', amountMinor: 500, voids: null },
    ] })).toEqual({ expected: { cash: 0 }, salesCount: 0 })
  })

  it('adds nothing for no_sale', () => {
    expect(deriveSessionFigures({ countedFloatMinor: 100, orders: [], movements: [
      { id: 'no-sale', type: 'no_sale', amountMinor: 0, voids: null },
    ] })).toEqual({ expected: { cash: 100 }, salesCount: 0 })
  })

  it('counts orders rather than payments and uses zero for an unreceived counted method', () => {
    const figures = deriveSessionFigures({ countedFloatMinor: 0, movements: [], orders: [{ payments: [
      { method: 'external', amountMinor: 1500 }, { method: 'cash', amountMinor: 500 },
    ] }] })
    expect(figures).toEqual({ expected: { cash: 500, external: 1500 }, salesCount: 1 })
    expect(Object.keys(figures.expected)).toEqual(['cash', 'external'])
    expect(deriveVariance({ cash: 500, other: 100 }, figures.expected)).toEqual({ cash: 0, other: 100 })
  })

  it('lowers expected cash by refunds without changing salesCount', () => {
    expect(deriveSessionFigures({ ...workedExample, refunds: [{ byMethod: { cash: 300 } }] }))
      .toEqual({ expected: { cash: 14456 }, salesCount: 1, refundsTotalMinor: 300 })
  })

  it('applies split refunds and makes a method without sales negative', () => {
    expect(deriveSessionFigures({ countedFloatMinor: 100, movements: [], orders: [
      { payments: [{ method: 'cash', amountMinor: 500 }, { method: 'card', amountMinor: 1000 }] },
    ], refunds: [{ byMethod: { cash: 300, card: 200 } }, { byMethod: { cash: 50, external: 75 } }] }))
      .toEqual({ expected: { cash: 250, card: 800, external: -75 }, salesCount: 1, refundsTotalMinor: 625 })
  })

  it('returns a zero refund total for an empty list and omits it for undefined refunds', () => {
    expect(deriveSessionFigures({ ...workedExample, refunds: [] }))
      .toEqual({ expected: { cash: 14756 }, salesCount: 1, refundsTotalMinor: 0 })
    expect(deriveSessionFigures({ ...workedExample, refunds: undefined }))
      .toEqual({ expected: { cash: 14756 }, salesCount: 1 })
  })

  it('skips malformed refunds and amounts without throwing', () => {
    const refunds = [null, undefined, 1, 'refund', {}, { byMethod: null }, { byMethod: 1 },
      { byMethod: 'cash' }, { byMethod: [] }, { byMethod: new Date() },
      { byMethod: { '': 500, negative: -1, fraction: 1.5, string: '500', unsafe: Number.MAX_SAFE_INTEGER + 1,
        nan: NaN, infinity: Infinity } },
    ] as unknown as NonNullable<typeof workedExample.refunds>
    expect(deriveSessionFigures({ countedFloatMinor: 100, orders: [], movements: [], refunds }))
      .toEqual({ expected: { cash: 100 }, salesCount: 0, refundsTotalMinor: 0 })
    refunds.push({ byMethod: { cash: 25, zero: 0 } })
    expect(deriveSessionFigures({ countedFloatMinor: 100, orders: [], movements: [], refunds }))
      .toEqual({ expected: { cash: 75, zero: 0 }, salesCount: 0, refundsTotalMinor: 25 })
  })

  it('treats __proto__ as an ordinary refund method and accepts null-prototype records', () => {
    const byMethod = Object.assign(Object.create(null), { ['__proto__']: 100, constructor: 20 })
    const figures = deriveSessionFigures({ countedFloatMinor: 0, movements: [], orders: [
      { payments: [{ method: '__proto__', amountMinor: 400 }] },
    ], refunds: [{ byMethod }, { byMethod: { ['__proto__']: 50, toString: 30 } }] })
    expect(figures).toEqual({ expected: { cash: 0, ['__proto__']: 250, constructor: -20, toString: -30 },
      salesCount: 1, refundsTotalMinor: 200 })
    expect(Object.keys(figures.expected)).toEqual(['cash', '__proto__', 'constructor', 'toString'])
    expect(Object.getPrototypeOf(figures.expected)).toBe(Object.prototype)
  })
})
