import { payloadShapeErrors } from './order-payload-shape'
import { isPlainObject, shapeErrors } from './shape-errors'

function updateOnlyErrors(payload: unknown): string[] {
  const { errors, check } = shapeErrors()
  if (!isPlainObject(payload)) return ['payload: expected an object']
  const body = payload as Record<string, unknown>
  const id = (value: unknown, field: string) => {
    const max = field === 'baseRevision' ? 128 : 64
    check(typeof value === 'string' && value.length > 0 && value.length <= max, field, `a non-empty string of at most ${max} characters`)
    if (typeof value === 'string') check(!value.includes('\u0000'), field, 'no NUL character')
  }
  id(body.orderId, 'orderId')
  if (body.baseRevision !== undefined) id(body.baseRevision, 'baseRevision')
  check(Number.isSafeInteger(body.createVersion) && (body.createVersion as number) >= 1, 'createVersion', 'a positive safe integer')
  const seenIds = { storeLineId: new Set<unknown>(), paymentId: new Set<unknown>() }
  for (const [field, key] of [['lines', 'storeLineId'], ['fees', 'storeLineId'], ['shipping', 'storeLineId'], ['payments', 'paymentId']] as const) {
    const items = body[field], seen = seenIds[key]
    if (!Array.isArray(items)) continue
    for (const [index, item] of items.entries()) {
      if (typeof item !== 'object' || item === null || Array.isArray(item) || item[key] === undefined) continue
      id(item[key], `${field}[${index}].${key}`)
      check(!seen.has(item[key]), `${field}[${index}].${key}`, 'unique')
      seen.add(item[key])
    }
  }
  return errors
}

/** Strict update identity and order.create body shape errors, at most ten (ADR-090). */
export function updatePayloadErrors(payload: unknown): string[] {
  const errors = updateOnlyErrors(payload)
  if (errors[0] === 'payload: expected an object') return errors
  return [...errors, ...payloadShapeErrors(orderCreatePart(payload as Record<string, unknown>))].slice(0, 10)
}

/** Copies the body without orderId, baseRevision, createVersion, lines/fees/shipping storeLineId or payments paymentId (ADR-090). */
export function orderCreatePart(payload: Record<string, unknown>): Record<string, unknown> {
  const part = { ...payload }
  for (const key of ['orderId', 'baseRevision', 'createVersion']) delete part[key]
  for (const [field, key] of [['lines', 'storeLineId'], ['fees', 'storeLineId'], ['shipping', 'storeLineId'], ['payments', 'paymentId']] as const) {
    const items = part[field]
    if (Array.isArray(items)) part[field] = items.map(item => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) return item
      const copy = { ...item }
      delete copy[key]
      return copy
    })
  }
  return part
}
