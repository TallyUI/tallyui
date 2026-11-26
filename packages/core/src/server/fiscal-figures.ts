import type { CommandError, OrderCreatePayload } from '../types'
import { currencyDecimals } from './money'

export type { OrderCreateDisplay, OrderCreateTaxRate } from '../types'
/** @deprecated Use `CommandError` from `@tallyui/core`; kept for plugins migrating from local copies. */
export type CommandErrorWithData = CommandError
/** @deprecated Use `OrderCreatePayload` from `@tallyui/core`; kept for plugins migrating from local copies. */
export type OrderCreatePayloadV3 = OrderCreatePayload

export function fiscalFiguresErrors(payload: OrderCreatePayload): string[] {
  const errors: string[] = []
  const check = (valid: boolean, path: string, expected: string) => {
    if (!valid && errors.length < 10) errors.push(`${path}: expected ${expected}`)
  }
  const object = (value: unknown, path: string, keys: string[]): value is Record<string, unknown> => {
    const valid = typeof value === 'object' && value !== null && !Array.isArray(value)
    check(valid, path, 'an object')
    if (valid) for (const key of Object.keys(value)) check(keys.includes(key), `${path}.${key}`, 'no unknown key')
    return valid
  }
  const money = (value: Record<string, unknown>, path: string, keys: string[]) => {
    for (const key of keys) check(Number.isSafeInteger(value[key]), `${path}.${key}`, 'a safe integer')
  }
  const { display, taxByRate } = payload
  if (object(display, 'display', ['currency', 'exponent', 'taxInclusive', 'subtotalMinor', 'discountMinor', 'taxMinor', 'totalMinor', 'orderDiscountMinor', 'lines', 'fees', 'shipping', 'coupons'])) {
    check(typeof display.currency === 'string', 'display.currency', 'a string')
    check(Number.isInteger(display.exponent) && display.exponent >= 0, 'display.exponent', 'an integer >= 0')
    check(typeof display.taxInclusive === 'boolean', 'display.taxInclusive', 'a boolean')
    money(display, 'display', ['subtotalMinor', 'discountMinor', 'taxMinor', 'totalMinor', 'orderDiscountMinor'])
    check(Array.isArray(display.lines), 'display.lines', 'an array')
    if (Array.isArray(display.lines)) display.lines.forEach((line, index) => {
      const path = `display.lines[${index}]`
      if (!object(line, path, ['clientLineId', 'amountMinor', 'discounts'])) return
      check(typeof line.clientLineId === 'string', `${path}.clientLineId`, 'a string')
      money(line, path, ['amountMinor'])
      check(Array.isArray(line.discounts), `${path}.discounts`, 'an array')
      if (Array.isArray(line.discounts)) line.discounts.forEach((discount, index) => {
        const discountPath = `${path}.discounts[${index}]`
        if (!object(discount, discountPath, ['discountId', 'label', 'amountMinor'])) return
        check(typeof discount.discountId === 'string', `${discountPath}.discountId`, 'a string')
        if (discount.label !== undefined) check(typeof discount.label === 'string', `${discountPath}.label`, 'a string')
        money(discount, discountPath, ['amountMinor'])
      })
    })
    if (payload.fees?.length || payload.shipping?.length) check(display.taxInclusive === payload.pricesIncludeTax, 'display.taxInclusive', 'payload.pricesIncludeTax')
    for (const field of ['fees', 'shipping'] as const) {
      const id = field === 'fees' ? 'clientFeeId' : 'clientShippingId'
      const charges = new Map((payload[field] ?? []).map(entry => [
        'clientFeeId' in entry ? entry.clientFeeId : entry.clientShippingId, entry,
      ]))
      const rows = display[field]
      if (rows !== undefined) check(Array.isArray(rows), `display.${field}`, 'an array')
      const seen = new Set<unknown>()
      if (Array.isArray(rows)) rows.forEach((row: unknown, index) => {
        const path = `display.${field}[${index}]`
        if (!object(row, path, [id, 'amountMinor'])) return
        check(typeof row[id] === 'string' && row[id].length > 0, `${path}.${id}`, 'a non-empty string')
        money(row, path, ['amountMinor'])
        const entry = charges.get(row[id] as string)
        check(entry !== undefined, `${path}.${id}`, `a payload.${field}[].${id}`)
        check(!seen.has(row[id]), `${path}.${id}`, `no duplicate ${id}`)
        seen.add(row[id])
        if (entry) {
          // #1383: the display row stays in display mode, the wire charge is in its own mode, and a converted row may carry the till's one-cent display residue (order-builder.ts).
          const converted = entry.amountIncludesTax !== undefined && entry.amountIncludesTax !== payload.pricesIncludeTax
          const expected = !converted ? entry.amountMinor : entry.amountMinor + (entry.amountIncludesTax ? -entry.taxMinor : entry.taxMinor)
          const matches = converted ? typeof row.amountMinor === 'number' && Math.abs(row.amountMinor - expected) <= 1 : row.amountMinor === expected
          check(matches, `${path}.amountMinor`, `the payload.${field} amountMinor${converted ? ' converted to the display tax mode' : ''}`)
        }
      })
      for (const key of charges.keys()) check(seen.has(key), `display.${field}`, `a row for ${id} ${key}`)
    }
    const codes = new Set((payload.coupons ?? []).map(coupon => coupon.code))
    const seen = new Set<string>()
    if (Array.isArray(display.coupons)) display.coupons.forEach((row, index) => {
      const path = `display.coupons[${index}]`
      check(codes.has(row.code), `${path}.code`, 'a payload.coupons[].code')
      check(!seen.has(row.code), `${path}.code`, 'no duplicate code')
      seen.add(row.code)
    })
  }
  check(Array.isArray(taxByRate), 'taxByRate', 'an array')
  if (Array.isArray(taxByRate)) taxByRate.forEach((rate, index) => {
    const path = `taxByRate[${index}]`
    if (!object(rate, path, ['ratePpm', 'code', 'netMinor', 'taxMinor', 'grossMinor'])) return
    check(Number.isInteger(rate.ratePpm), `${path}.ratePpm`, 'an integer')
    if (rate.code !== undefined) check(typeof rate.code === 'string', `${path}.code`, 'a string')
    money(rate, path, ['netMinor', 'taxMinor', 'grossMinor'])
  })
  if (errors.length || !display || !Array.isArray(taxByRate)) return errors
  check(display.currency === payload.currency, 'display.currency', 'payload.currency')
  check(display.totalMinor === payload.totalMinor, 'display.totalMinor', 'payload.totalMinor')
  check(display.taxMinor === payload.taxMinor, 'display.taxMinor', 'payload.taxMinor')
  check(taxByRate.length > 0 || payload.taxMinor === 0, 'taxByRate', 'a non-empty array when payload.taxMinor is nonzero')
  check(Number.isSafeInteger(payload.taxMinor) && taxByRate.reduce((sum, rate) => sum + BigInt(rate.taxMinor), 0n) === BigInt(payload.taxMinor), 'taxByRate', 'the sum of taxMinor to equal payload.taxMinor')
  taxByRate.forEach((rate, index) => check(BigInt(rate.grossMinor) === BigInt(rate.netMinor) + BigInt(rate.taxMinor), `taxByRate[${index}].grossMinor`, 'netMinor + taxMinor'))
  const ids = new Set(Array.isArray(payload.lines) ? payload.lines.map(line => line?.clientLineId) : [])
  const seen = new Set<string>()
  display.lines.forEach((line, index) => {
    check(ids.has(line.clientLineId), `display.lines[${index}].clientLineId`, 'a payload.lines[].clientLineId')
    check(!seen.has(line.clientLineId), `display.lines[${index}].clientLineId`, 'no duplicate clientLineId')
    seen.add(line.clientLineId)
  })
  if (!errors.length) {
    // ADR-063 I1–I3 (#1256): display's own figures add up. taxByRate gross is not tied to totalMinor (zero-rated lines and
    // tax-none charges may be absent from it, and cash roundings are tax-none); display.subtotalMinor is not tied to
    // payload.subtotalMinor (display is in the display tax mode, and in store mode the payload subtotal is net of coupons).
    const sum = (rows: ReadonlyArray<{ amountMinor: number }> | undefined) => (rows ?? []).reduce((total, row) => total + BigInt(row.amountMinor), 0n)
    const roundings = (payload.cashRoundings ?? []).reduce((total, entry) => total + BigInt(entry.minor), 0n)
    check(BigInt(display.subtotalMinor) - BigInt(display.discountMinor) + sum(display.fees) + sum(display.shipping)
      + (display.taxInclusive ? 0n : BigInt(display.taxMinor)) + roundings === BigInt(display.totalMinor),
    'display.totalMinor', 'subtotalMinor − discountMinor + fees + shipping (+ taxMinor when exclusive) + cashRoundings')
    check(sum(display.lines) === BigInt(display.subtotalMinor), 'display.subtotalMinor', 'the sum of display.lines[].amountMinor')
    check(BigInt(display.discountMinor) === BigInt(display.orderDiscountMinor) + display.lines.reduce((total, line) => total + sum(line.discounts), 0n)
      + sum(display.coupons), 'display.discountMinor', 'orderDiscountMinor + the line discount rows + the coupon rows')
  }
  try {
    check(display.exponent === currencyDecimals(payload.currency), 'display.exponent', 'the currency decimals')
  } catch {
    // Leave unsupported currencies to the planner's unsupported_currency rejection.
  }
  // The shared string bound and NUL check (payloadBoundErrors' length rule and payloadShapeErrors' NUL rule) on the v3 strings, after every check above.
  const text = (value: unknown, path: string) => {
    if (typeof value !== 'string') return
    check(value.length <= 255, path, 'at most 255 characters')
    check(!value.includes('\u0000'), path, 'no NUL character')
  }
  display.lines.forEach((line, index) => line.discounts.forEach((discount, i) => {
    for (const key of ['discountId', 'label'] as const) text(discount[key], `display.lines[${index}].discounts[${i}].${key}`)
  }))
  taxByRate.forEach((rate, index) => text(rate.code, `taxByRate[${index}].code`))
  return errors
}
