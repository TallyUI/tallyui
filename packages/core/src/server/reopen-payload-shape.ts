import { isPlainObject, shapeErrors } from './shape-errors'

/** Strict shape errors per ADR-070 and ADR-090 for order.reopen v1; plugins run this before any lookup. */
export function reopenPayloadErrors(payload: unknown): string[] {
  const { errors, check, noNul } = shapeErrors()
  if (!isPlainObject(payload)) return ['payload: expected an object']
  const fields = ['orderId', 'clientOrderId', 'baseRevision', 'cashierRef', 'registerId', 'storeId', 'createdAt']
  for (const key of Object.keys(payload)) {
    if (!fields.includes(key) && errors.length < 10) {
      errors.push(`${key.includes('\u0000') ? JSON.stringify(key) : key}: unknown field for order.reopen version 1`)
    }
  }
  for (const field of ['orderId', 'cashierRef', 'registerId', 'clientOrderId', 'baseRevision', 'storeId']) {
    const value = payload[field]
    if (['clientOrderId', 'baseRevision', 'storeId'].includes(field) && value === undefined) continue
    const max = field === 'baseRevision' ? 128 : 64
    check(typeof value === 'string' && value.length > 0 && value.length <= max,
      field, `a non-empty string of at most ${max} characters`)
    noNul(value, field)
  }
  check(typeof payload.createdAt === 'string' && payload.createdAt.length > 0 && !Number.isNaN(Date.parse(payload.createdAt)),
    'createdAt', 'a valid date')
  noNul(payload.createdAt, 'createdAt')
  return errors
}
