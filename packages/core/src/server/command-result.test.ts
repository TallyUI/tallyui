// @vitest-environment node
import { expect, it } from 'vitest'
import { CommandResultError, parseCommandResult } from './command-result'

const serverRefs = { orderId: 'order_123', displayId: '123', totalMinor: 1200 }
const warnings = [
  { code: 'total_mismatch', expectedMinor: 1100, serverMinor: 1200 },
  { code: 'insufficient_stock', variantId: 'variant_123', quantity: 1 },
]
const applied = { id: 'command_123', status: 'applied', serverRefs, warnings }
const rejected = { id: 'command_123', status: 'rejected', error: { code: 'invalid', message: '' } }

const thrown = (value: unknown): unknown => {
  try {
    parseCommandResult(value)
  } catch (error) {
    return error
  }
  throw new Error('Expected parseCommandResult to throw')
}

it.each([applied, rejected, { id: 'command_123', status: 'duplicate', serverRefs }])(
  'parses a valid $status result', value => {
    expect(parseCommandResult(value)).toEqual(value)
  }
)

it('accepts absent optional fields and an empty displayId', () => {
  expect(parseCommandResult({ id: 'c', status: 'duplicate' })).toEqual({ id: 'c', status: 'duplicate' })
  expect(parseCommandResult({ ...applied, serverRefs: { ...serverRefs, displayId: '' } }).serverRefs?.displayId).toBe('')
  const { displayId, ...refs } = serverRefs
  expect(parseCommandResult({ ...applied, serverRefs: refs }).serverRefs).toEqual(refs)
})

it.each([
  ['result', null],
  ['result', []],
  ['result', 'text'],
  ['id', { ...applied, id: '' }],
  ['id', { ...applied, id: 1 }],
  ['status', { ...applied, status: 'in_progress' }],
  ['serverRefs', { ...applied, serverRefs: undefined }],
  ['serverRefs', { ...applied, serverRefs: null }],
  ['serverRefs', { ...applied, serverRefs: [] }],
  ['serverRefs.orderId', { ...applied, serverRefs: { totalMinor: 1 } }],
  ['serverRefs.orderId', { ...applied, serverRefs: { ...serverRefs, orderId: '' } }],
  ['serverRefs.displayId', { ...applied, serverRefs: { ...serverRefs, displayId: 1 } }],
  ['serverRefs.totalMinor', { ...applied, serverRefs: { ...serverRefs, totalMinor: 1.5 } }],
  ['serverRefs.totalMinor', { ...applied, serverRefs: { ...serverRefs, totalMinor: Number.MAX_SAFE_INTEGER + 1 } }],
  ['warnings', { ...applied, warnings: {} }],
  ['warnings[0]', { ...applied, warnings: [null] }],
  ['warnings[0]', { ...applied, warnings: [[]] }],
  ['warnings[0].code', { ...applied, warnings: [{ code: 'unknown' }] }],
  ['warnings[0].expectedMinor', { ...applied, warnings: [{ ...warnings[0], expectedMinor: 1.5 }] }],
  ['warnings[0].serverMinor', { ...applied, warnings: [{ ...warnings[0], serverMinor: '1' }] }],
  ['warnings[0].variantId', { ...applied, warnings: [{ ...warnings[1], variantId: '' }] }],
  ['warnings[0].quantity', { ...applied, warnings: [{ ...warnings[1], quantity: 1.5 }] }],
  ['warnings[0].quantity', { ...applied, warnings: [{ ...warnings[1], quantity: 0 }] }],
  ['warnings[0].bridgeMinor', { ...applied, warnings: [{ ...warnings[0], bridgeMinor: 1.5 }] }],
  ['warnings[0].bridgeMinor', { ...applied, warnings: [{ ...warnings[0], bridgeMinor: '5' }] }],
  ['warnings[0].ratePpm', { ...applied, warnings: [{ code: 'tax_rate_mismatch', ratePpm: -1, expectedMinor: 120, serverMinor: 100 }] }],
  ['warnings[0].expectedMinor', { ...applied, warnings: [{ code: 'tax_rate_mismatch', ratePpm: 200000, expectedMinor: 1.5, serverMinor: 100 }] }],
  ['warnings[0].customerId', { ...applied, warnings: [{ code: 'customer_ignored', customerId: '' }] }],
  ['warnings[0].customerId', { ...applied, warnings: [{ code: 'customer_ignored', customerId: 'c'.repeat(65) }] }],
  ['warnings[0].customerId', { ...applied, warnings: [{ code: 'customer_ignored', customerId: 1 }] }],
  ['error', { ...rejected, error: undefined }],
  ['error', { ...rejected, error: null }],
  ['error', { ...rejected, error: [] }],
  ['error.code', { ...rejected, error: { code: '', message: '' } }],
  ['error.message', { ...rejected, error: { code: 'invalid', message: 1 } }],
])('rejects an invalid %s', (field, value) => {
  const error = thrown(value)
  expect(error).toBeInstanceOf(CommandResultError)
  expect(error).toBeInstanceOf(Error)
  expect((error as Error).message).toContain(field)
})

it('names the first bad field', () => {
  expect(() => parseCommandResult({ id: '', status: 'unknown' })).toThrow('Invalid id')
})

it("names its error 'CommandResultError'", () => {
  expect((thrown(null) as Error).name).toBe('CommandResultError')
})

it('parses a register applied result without serverRefs and keeps register', () => {
  const register = { session: { id: 's', status: 'open' }, counters: { lastClosureNumber: 0 } }
  const value = { id: 'c', status: 'applied', register }
  expect(parseCommandResult(value)).toEqual(value)
  expect(parseCommandResult(value)).toHaveProperty('register', register)
})

it('keeps error.data on a rejected result', () => {
  const data = { sessionId: 's', counters: { lastClosureNumber: 1 } }
  const value = { ...rejected, error: { ...rejected.error, data } }
  expect(parseCommandResult(value)).toEqual(value)
})

it('refuses applied with neither serverRefs nor register', () => {
  expect(() => parseCommandResult({ id: 'c', status: 'applied' })).toThrow('Invalid serverRefs: required for applied')
})

it.each([null, [], 'text', 1, new Date()])('refuses non-object error.data and register: %s', value => {
  expect(() => parseCommandResult({ ...rejected, error: { ...rejected.error, data: value } })).toThrow('Invalid error.data')
  expect(() => parseCommandResult({ ...applied, register: value })).toThrow('Invalid register')
})

it('round-trips a total_mismatch with bridgeMinor', () => {
  const value = { ...applied, warnings: [{ code: 'total_mismatch', expectedMinor: 1200, serverMinor: 1195, bridgeMinor: 5 }] }
  expect(parseCommandResult(value)).toEqual(value)
})

it('round-trips a tax_rate_mismatch, including through JSON', () => {
  const value = { ...applied, warnings: [{ code: 'tax_rate_mismatch', ratePpm: 200000, expectedMinor: 120, serverMinor: 100 }] }
  expect(parseCommandResult(value)).toEqual(value)
  expect(parseCommandResult(JSON.parse(JSON.stringify(value)))).toEqual(value)
})

it('accepts a tax_rate_mismatch with ratePpm: 0', () => {
  const value = { ...applied, warnings: [{ code: 'tax_rate_mismatch', ratePpm: 0, expectedMinor: 120, serverMinor: 100 }] }
  expect(parseCommandResult(value)).toEqual(value)
})

it('accepts a customer_ignored (64 characters at most) and drops an extra reason', () => {
  const value = { ...applied, warnings: [{ code: 'customer_ignored', customerId: 'c'.repeat(64), reason: 'unknown' }] }
  expect(parseCommandResult(value).warnings).toEqual([{ code: 'customer_ignored', customerId: 'c'.repeat(64) }])
})

it('accepts a register_session_unknown and drops extra keys', () => {
  const warning = { code: 'register_session_unknown', sessionId: 's'.repeat(64) }
  expect(parseCommandResult({ ...applied, warnings: [{ ...warning, extra: true }] }).warnings).toEqual([warning])
})

it('rejects a register_session_unknown with an empty sessionId', () => {
  const error = thrown({ ...applied, warnings: [{ code: 'register_session_unknown', sessionId: '' }] })
  expect(error).toBeInstanceOf(CommandResultError)
  expect((error as Error).message).toBe('Invalid warnings[0].sessionId')
})

const subtotal = { field: 'subtotalMinor', tillMinor: 1050, serverMinor: 1000 }
const tax = { field: 'taxMinor', tillMinor: 210, serverMinor: 200 }
const figures = (fields: unknown) => ({ ...applied, warnings: [warnings[0], { code: 'figures_mismatch', fields }] })

it('accepts a figures_mismatch and drops extra keys', () => {
  const discount = { field: 'discountMinor', tillMinor: 0, serverMinor: 50 }
  const value = { ...applied, warnings: [{ code: 'figures_mismatch', fields: [{ ...subtotal, extra: 1 }, tax, discount], extra: 1 }] }
  expect(parseCommandResult(value).warnings).toEqual([{ code: 'figures_mismatch', fields: [subtotal, tax, discount] }])
})

it.each([
  ['warnings[1].fields', []],
  ['warnings[1].fields', { 0: subtotal }],
  ['warnings[1].fields[0].field', [{ ...subtotal, field: 'grandTotalMinor' }]],
  ['warnings[1].fields[1].field', [subtotal, { ...subtotal, tillMinor: 1100 }]],
  ['warnings[1].fields[1].tillMinor', [subtotal, { ...tax, tillMinor: 210.5 }]],
  ['warnings[1].fields[0].serverMinor', [{ ...tax, serverMinor: '200' }]],
  ['warnings[1].fields[1].serverMinor', [subtotal, { ...tax, serverMinor: 210 }]],
  ['warnings[1].fields[1]', [subtotal, null]],
])('rejects a figures_mismatch with Invalid %s', (path, fields) => {
  const error = thrown(figures(fields))
  expect(error).toBeInstanceOf(CommandResultError)
  expect((error as Error).message).toBe(`Invalid ${path}`)
})

it('accepts a null bridgeMinor and omits it from the output', () => {
  const value = { ...applied, warnings: [{ code: 'total_mismatch', expectedMinor: 1200, serverMinor: 1195, bridgeMinor: null }] }
  expect(parseCommandResult(value).warnings).toEqual([{ code: 'total_mismatch', expectedMinor: 1200, serverMinor: 1195 }])
})

it('drops unknown keys at every level without mutating the input', () => {
  const moreWarnings = [
    { code: 'total_mismatch', expectedMinor: 1200, serverMinor: 1195, bridgeMinor: 5 },
    { code: 'tax_rate_mismatch', ratePpm: 200000, expectedMinor: 120, serverMinor: 100 },
  ]
  const value = {
    ...applied, extra: true,
    serverRefs: { ...serverRefs, extra: true },
    warnings: [...warnings, ...moreWarnings].map(warning => ({ ...warning, extra: true })),
    error: { ...rejected.error, extra: true },
  }
  expect(parseCommandResult(value)).toEqual({ ...applied, warnings: [...warnings, ...moreWarnings], error: rejected.error })
  expect(value.serverRefs.extra).toBe(true)
  expect(value.warnings.every(warning => warning.extra)).toBe(true)
})
