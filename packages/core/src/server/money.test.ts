// @vitest-environment node
import { expect, it } from 'vitest'
import { currencyDecimals, majorToMinor, minorToMajor } from './money'

it.each([['EUR', 2], ['JPY', 0], ['BHD', 3], ['eur', 2]] as const)(
  'uses the currency exponent for %s', (currency, decimals) => {
    expect(currencyDecimals(currency)).toBe(decimals)
  }
)

it('throws for a currency code Intl rejects', () => {
  expect(() => currencyDecimals('BOGUS')).toThrow()
})

it.each([
  [850, 2, '8.50'], [5, 2, '0.05'], [1000, 0, '1000'], [-5, 2, '-0.05'],
  [0, 2, '0.00'], [0, 0, '0'], [Number.MAX_SAFE_INTEGER, 3, '9007199254740.991'],
])('converts %s minor units at exponent %s to %s', (minor, decimals, expected) => {
  expect(minorToMajor(minor as number, decimals as number)).toBe(expected)
})

it.each([1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects unsafe minor amount %s', minor => {
  expect(() => minorToMajor(minor, 2)).toThrow()
})

it.each([
  ['3.094', 2, 309], ['3.095', 2, 310], ['10', 2, 1000], ['-0.005', 2, -1],
  ['8.5', 2, 850], ['0', 2, 0], ['1.2e-7', 2, 0],
  ['12345678901234.565', 2, 1234567890123457],
  ['-12345678901234.565', 2, -1234567890123457],
  ['12345678901234.564999', 2, 1234567890123456],
  ['-3.094', 2, -309], ['-3.095', 2, -310], ['5e-3', 2, 1], ['-5E-3', 2, -1],
  ['1.2e+3', 2, 120000], ['1.5', 0, 2], ['-1.5', 0, -2], ['0.0005', 3, 1],
  [8.5, 2, 850], [3.095, 2, 310], [-0.005, 2, -1], [1.2e-7, 2, 0], [0, 2, 0],
] as const)('rounds %s major units at exponent %s to %s', (value, decimals, expected) => {
  expect(majorToMinor(value, decimals)).toBe(expected)
})

it.each([NaN, Infinity, -Infinity, 'NaN', 'abc', '', '9007199254740992'])(
  'rejects invalid or unsafe major amount %s', value => {
    expect(() => majorToMinor(value, 0)).toThrow()
  }
)

it.each([0, 2, 3])('round trips safe minor amounts at exponent %s', decimals => {
  const amounts = [Number.MIN_SAFE_INTEGER, -1001, -850, -5, -1, 0, 1, 5, 850, 1001, Number.MAX_SAFE_INTEGER]
  for (const minor of amounts) {
    expect(majorToMinor(minorToMajor(minor, decimals), decimals)).toBe(minor)
  }
})

const ORIGINAL_PATTERN = /^([+-]?)(\d+\.?\d*|\.\d+)(?:e([+-]?\d+))?$/i
const NEW_PATTERN = /^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:e([+-]?\d+))?$/i

it('majorToMinor accepts exactly what the original pattern accepted', () => {
  const inputs = [
    '12', '12.', '12.5', '.5', '-0.005', '+1e3', '1.5E-2',
    '', '.', '1..2', 'e5', '1e', ' 1', '1_000', '0x10', 'Infinity', 'NaN',
    '0', '0.0', '+.5', '-.5', '5.', '+5.', '-5.', '1e+3', '1e-3', '1E3',
    '..', '1.2.3', 'abc', '1a', '--1', '1-', '1.2e', '1.2e+', '1.2e-',
  ]
  for (const input of inputs) {
    const originalResult = ORIGINAL_PATTERN.exec(input)
    const newResult = NEW_PATTERN.exec(input)
    if (originalResult === null || newResult === null) {
      expect(newResult).toBe(originalResult)
    } else {
      expect([...newResult]).toEqual([...originalResult])
    }
    // Tie NEW_PATTERN to the real implementation: majorToMinor must accept or reject each
    // input exactly as the pattern documented above predicts (decimals: 2 keeps every accepted
    // value well inside the safe-integer range, so only the regex step can cause a mismatch).
    if (newResult === null) expect(() => majorToMinor(input, 2)).toThrow(RangeError)
    else expect(() => majorToMinor(input, 2)).not.toThrow()
  }
})

it('majorToMinor rejects a long malformed digit string quickly', () => {
  const value = '9'.repeat(100_000) + 'x'
  const start = performance.now()
  expect(() => majorToMinor(value, 2)).toThrow(RangeError)
  expect(performance.now() - start).toBeLessThan(200)
})
