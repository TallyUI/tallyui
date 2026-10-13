/** Strict shape errors per ADR-070 and ADR-080 for order.refund v1; plugins run this before any lookup. */
export function refundPayloadErrors(payload: unknown): string[] {
  const errors: string[] = []
  const object = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  const check = (valid: boolean, field: string, expected: string) => {
    if (!valid && errors.length < 10) errors.push(`${field}: expected ${expected}`)
  }
  if (!object(payload)) return ['payload: expected an object']
  const noNul = (value: unknown, field: string) => {
    if (typeof value === 'string') check(!value.includes('\u0000'), field, 'no NUL character')
  }
  const fields = ['clientRefundId', 'orderId', 'registerId', 'sessionId', 'clientOrderId', 'cashierRef',
    'lines', 'shippingMinor', 'totalMinor', 'adjustmentMinor', 'destination', 'reason', 'createdAt']
  for (const key of Object.keys(payload)) {
    if (!fields.includes(key) && errors.length < 10) {
      errors.push(`${key.includes('\u0000') ? JSON.stringify(key) : key}: unknown field for order.refund version 1`)
    }
  }
  for (const field of ['clientRefundId', 'orderId', 'registerId', 'sessionId', 'clientOrderId', 'cashierRef']) {
    const value = payload[field]
    if (['clientOrderId', 'cashierRef'].includes(field) && value === undefined) continue
    check(typeof value === 'string' && value.length > 0 && value.length <= 64,
      field, 'a non-empty string of at most 64 characters')
    noNul(value, field)
  }
  check(Array.isArray(payload.lines) && payload.lines.length <= 500, 'lines', 'an array of at most 500 lines')
  const seen = new Set<string>()
  if (Array.isArray(payload.lines)) payload.lines.forEach((line, index) => {
    const path = `lines[${index}]`
    if (!object(line)) {
      check(false, path, 'an object')
      return
    }
    for (const key of Object.keys(line)) {
      if (!['orderLineId', 'quantity', 'restock'].includes(key) && errors.length < 10) {
        errors.push(`${path}.${key.includes('\u0000') ? JSON.stringify(key) : key}: unknown field for order.refund version 1`)
      }
    }
    check(typeof line.orderLineId === 'string' && line.orderLineId.length > 0 && line.orderLineId.length <= 64,
      `${path}.orderLineId`, 'a non-empty string of at most 64 characters')
    noNul(line.orderLineId, `${path}.orderLineId`)
    if (typeof line.orderLineId === 'string') {
      check(!seen.has(line.orderLineId), `${path}.orderLineId`, 'unique in lines')
      seen.add(line.orderLineId)
    }
    check(Number.isSafeInteger(line.quantity) && (line.quantity as number) >= 1, `${path}.quantity`, 'a safe integer >= 1')
    check(typeof line.restock === 'boolean', `${path}.restock`, 'a boolean')
  })
  for (const field of ['shippingMinor', 'totalMinor']) {
    check(Number.isSafeInteger(payload[field]) && (payload[field] as number) >= 0, field, 'a safe integer >= 0')
  }
  check(Number.isSafeInteger(payload.adjustmentMinor), 'adjustmentMinor', 'a safe integer')
  check(payload.destination === 'original_method' || payload.destination === 'cash', 'destination', 'original_method or cash')
  noNul(payload.destination, 'destination')
  check(typeof payload.reason === 'string' && payload.reason.trim().length > 0 && payload.reason.length <= 500,
    'reason', 'a non-empty string after trim of at most 500 characters')
  noNul(payload.reason, 'reason')
  check(typeof payload.createdAt === 'string' && payload.createdAt.length > 0 && !Number.isNaN(Date.parse(payload.createdAt)),
    'createdAt', 'a valid date')
  noNul(payload.createdAt, 'createdAt')
  return errors
}
