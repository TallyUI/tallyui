/** Strict shape errors per ADR-070 and ADR-090 for order.reopen v1; plugins run this before any lookup. */
export function reopenPayloadErrors(payload: unknown): string[] {
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
  const fields = ['orderId', 'clientOrderId', 'baseRevision', 'cashierRef', 'registerId', 'storeId', 'createdAt']
  for (const key of Object.keys(payload)) {
    if (!fields.includes(key) && errors.length < 10) {
      errors.push(`${key.includes('\u0000') ? JSON.stringify(key) : key}: unknown field for order.reopen version 1`)
    }
  }
  for (const field of ['orderId', 'cashierRef', 'registerId', 'clientOrderId', 'baseRevision', 'storeId']) {
    const value = payload[field]
    if (['clientOrderId', 'baseRevision', 'storeId'].includes(field) && value === undefined) continue
    check(typeof value === 'string' && value.length > 0 && value.length <= 64,
      field, 'a non-empty string of at most 64 characters')
    noNul(value, field)
  }
  check(typeof payload.createdAt === 'string' && payload.createdAt.length > 0 && !Number.isNaN(Date.parse(payload.createdAt)),
    'createdAt', 'a valid date')
  noNul(payload.createdAt, 'createdAt')
  return errors
}
