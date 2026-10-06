/** Shape errors of an order.create payload, e.g. ['lines: expected a non-empty array',
 * 'payments[0].method: expected a string']; [] when the shape is valid, at most ten. Checks
 * presence, types, the `customerId` (64) and `sessionId` (36) bounds, and U+0000 in any string;
 * numbers are finite numbers, and value ranges are the planner's job. A plugin runs it before its
 * replay lookup; every other length bound is payloadBoundErrors', after that lookup. The NUL check
 * runs last, so the earlier checks' errors keep their order. */
export function payloadShapeErrors(payload: unknown): string[] {
  const errors: string[] = []
  const object = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
  const check = (valid: boolean, path: string, expected: string) => {
    if (!valid && errors.length < 10) errors.push(`${path}: expected ${expected}`)
  }
  const number = (value: unknown, path: string) =>
    check(typeof value === 'number' && Number.isFinite(value), path, 'a finite number')
  // Discounts (ADR-062) are checked here, values included, when present.
  const discount = (value: unknown, path: string): bigint => {
    const valid = value === undefined || (Number.isSafeInteger(value) && (value as number) > 0)
    check(valid, path, 'a positive safe integer')
    return valid && value !== undefined ? BigInt(value as number) : 0n
  }
  if (!object(payload)) return ['payload: expected an object']
  check(typeof payload.clientOrderId === 'string' && payload.clientOrderId.length > 0, 'clientOrderId', 'a non-empty string')
  for (const field of ['createdAt', 'currency']) check(typeof payload[field] === 'string', field, 'a string')
  check(typeof payload.pricesIncludeTax === 'boolean', 'pricesIncludeTax', 'a boolean')
  for (const field of ['lines', 'payments']) {
    const items = payload[field]
    const isLines = field === 'lines'
    check(Array.isArray(items) && (!isLines || items.length > 0), field, isLines ? 'a non-empty array' : 'an array')
    if (!Array.isArray(items)) continue
    for (const [index, item] of items.entries()) {
      if (errors.length === 10) break
      const path = `${field}[${index}]`
      check(object(item), path, 'an object')
      if (!object(item)) continue
      for (const key of isLines ? ['clientLineId', 'variantId'] : ['clientPaymentId', 'method']) {
        if (key === 'variantId' && item.custom !== undefined && item.variantId === undefined) continue
        check(typeof item[key] === 'string', `${path}.${key}`, 'a string')
      }
      const optionalString = isLines ? 'title' : 'reference'
      if (item[optionalString] !== undefined) {
        check(typeof item[optionalString] === 'string', `${path}.${optionalString}`, 'a string')
      }
      if (isLines && item.taxInclusive !== undefined) {
        check(typeof item.taxInclusive === 'boolean', `${path}.taxInclusive`, 'a boolean')
      }
      for (const key of isLines ? ['quantity', 'unitPriceMinor'] : ['amountMinor']) number(item[key], `${path}.${key}`)
      if (!isLines) {
        for (const key of ['tenderedMinor', 'changeMinor']) {
          if (item[key] !== undefined) number(item[key], `${path}.${key}`)
        }
      }
    }
  }
  for (const field of ['subtotalMinor', 'taxMinor', 'totalMinor']) number(payload[field], field)
  const lineDiscounts = (Array.isArray(payload.lines) ? payload.lines : [])
    .reduce((sum: bigint, line, index) => sum + (object(line) ? discount(line.discountMinor, `lines[${index}].discountMinor`) : 0n), 0n)
  const orderDiscount = discount(payload.discountMinor, 'discountMinor')
  if (errors.length === 0) check(orderDiscount === lineDiscounts, 'discountMinor', 'the sum of lines[].discountMinor')
  if (payload.customer !== undefined && payload.customer !== null) {
    check(object(payload.customer), 'customer', 'an object')
    if (object(payload.customer) && payload.customer.email !== undefined) {
      check(typeof payload.customer.email === 'string', 'customer.email', 'a string')
    }
    if (object(payload.customer) && payload.customer.customerId !== undefined) {
      const id = payload.customer.customerId
      check(typeof id === 'string' && id.length > 0 && id.length <= 64, 'customer.customerId', 'a string of at most 64 characters')
    }
  }
  if (payload.sessionId !== undefined) {
    check(typeof payload.sessionId === 'string' && payload.sessionId.length > 0 && payload.sessionId.length <= 36,
      'sessionId', 'a string of at most 36 characters')
  }
  for (const field of ['registerId', 'cashierRef', 'locationId']) {
    if (payload[field] !== undefined) check(typeof payload[field] === 'string', field, 'a string')
  }
  for (const field of ['fees', 'shipping', 'lines']) {
    const items = payload[field]
    if (items === undefined || field === 'lines' && !Array.isArray(items)) continue
    check(Array.isArray(items), field, 'an array')
    if (!Array.isArray(items)) continue
    const id = field === 'fees' ? 'clientFeeId' : 'clientShippingId'
    const seen = new Set<unknown>()
    items.forEach((entry, index) => {
      const custom = field === 'lines'
      const item = custom && object(entry) ? entry.custom : entry
      const path = `${field}[${index}]${custom ? '.custom' : ''}`
      if (custom && (!object(entry) || item === undefined)) return
      check(object(item), path, 'an object')
      if (!object(item)) return
      const keys = custom ? ['name', 'sku', 'taxClass', 'taxStatus']
        : [id, 'name', 'amountMinor', 'taxMinor', 'taxStatus', 'taxClass', ...(field === 'shipping' ? ['methodId'] : [])]
      for (const key of Object.keys(item)) check(keys.includes(key), `${path}.${key}`, 'no unknown key')
      check(typeof item.name === 'string' && item.name.length > 0, `${path}.name`, 'a non-empty string')
      check(item.taxStatus === 'taxable' || item.taxStatus === 'none', `${path}.taxStatus`, 'taxable or none')
      for (const key of keys.filter(key => ['sku', 'taxClass', 'methodId'].includes(key))) {
        if (item[key] !== undefined) check(typeof item[key] === 'string', `${path}.${key}`, 'a string')
      }
      if (!custom) {
        check(typeof item[id] === 'string' && item[id].length > 0, `${path}.${id}`, 'a non-empty string')
        check(!seen.has(item[id]), `${path}.${id}`, `no duplicate ${id}`)
        seen.add(item[id])
        for (const key of ['amountMinor', 'taxMinor']) check(Number.isSafeInteger(item[key]) && (item[key] as number) >= 0, `${path}.${key}`, 'a safe integer >= 0')
      }
    })
  }
  // NUL, only on strings (the checks above name any other type): Postgres text can't hold it, and the lookup keys must be clean.
  for (const [value, path] of payloadStrings(payload)) check(!value.includes('\u0000'), path, 'no NUL character')
  return errors
}

/** Length-bound errors of an order.create payload, e.g. ['lines[0].title: expected at most 255
 * characters']; [] when every string is within its bound, at most ten. Bounds in UTF-16 code units:
 * `customer.email` 254, v5 ids 36 and class/sku/method 64, other strings 255 (`customerId` and `sessionId` keep theirs in
 * payloadShapeErrors); only strings are checked. A plugin calls it through precheckCommand, after
 * its replay lookup, so a bound tightened later never turns an applied command's resend into
 * `invalid_payload`. */
export function payloadBoundErrors(payload: unknown): string[] {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return []
  return payloadStrings(payload as Record<string, unknown>)
    .filter(([value, , max]) => max !== undefined && value.length > max)
    .map(([, path, max]) => `${path}: expected at most ${max} characters`).slice(0, 10)
}

/** Every string field order.create's checks cover, as [value, path, bound]; no bound for `customerId`
 *  and `sessionId`, whose bounds payloadShapeErrors checks with their own messages. */
function payloadStrings(payload: Record<string, unknown>): Array<[string, string, number | undefined]> {
  const found: Array<[unknown, string, number | undefined]> = []
  const object = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
  for (const field of ['clientOrderId', 'createdAt', 'currency', 'registerId', 'cashierRef', 'locationId']) found.push([payload[field], field, 255])
  for (const field of ['lines', 'payments']) {
    const items = payload[field]
    if (Array.isArray(items)) items.forEach((item, index) => {
      if (object(item)) for (const key of field === 'lines' ? ['clientLineId', 'variantId', 'title'] : ['clientPaymentId', 'method', 'reference']) {
        found.push([item[key], `${field}[${index}].${key}`, 255])
      }
    })
  }
  if (Array.isArray(payload.lines)) payload.lines.forEach((line, index) => {
    if (object(line) && object(line.custom)) for (const key of ['name', 'sku', 'taxClass', 'taxStatus']) {
      found.push([line.custom[key], `lines[${index}].custom.${key}`, key === 'name' ? 255 : 64])
    }
  })
  for (const field of ['fees', 'shipping']) for (const prefix of ['', 'display.']) {
    const parent = prefix ? payload.display : payload
    const items = object(parent) ? parent[field] : undefined
    if (Array.isArray(items)) items.forEach((item, index) => {
      if (object(item)) for (const key of prefix ? [field === 'fees' ? 'clientFeeId' : 'clientShippingId']
        : [field === 'fees' ? 'clientFeeId' : 'clientShippingId', 'name', 'taxClass', 'taxStatus', ...(field === 'shipping' ? ['methodId'] : [])]) {
        found.push([item[key], `${prefix}${field}[${index}].${key}`, key.startsWith('client') ? 36 : key === 'name' ? 255 : 64])
      }
    })
  }
  if (object(payload.customer)) found.push([payload.customer.email, 'customer.email', 254], [payload.customer.customerId, 'customer.customerId', undefined])
  found.push([payload.sessionId, 'sessionId', undefined])
  return found.filter((entry): entry is [string, string, number | undefined] => typeof entry[0] === 'string')
}
