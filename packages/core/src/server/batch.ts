import { MAX_COMMANDS_PER_BATCH } from '../commands'
import type { AnyCommandEnvelope, BatchTooLargeBody, CommandEnvelope, CommandResult, OrderCreatePayload, RegisterCommandEnvelope } from '../types'
import { fiscalFiguresErrors } from './fiscal-figures'
import { payloadBoundErrors, payloadShapeErrors } from './order-payload-shape'
import { refundPayloadErrors } from './refund-payload-shape'
import { registerPayloadErrors } from './register-payload-shape'
import { reopenPayloadErrors } from './reopen-payload-shape'
import { orderCreatePart, updatePayloadErrors } from './update-payload-shape'

/** An envelope validateBatch accepted: every field's shape is checked, and its version is any positive
 *  safe integer (precheckCommand decides which versions this server supports). */
export type ValidatedCommandEnvelope =
  | (Omit<CommandEnvelope<Record<string, unknown>>, 'version'> & { type: 'order.create'; version: number })
  | RegisterCommandEnvelope<Record<string, unknown>>
  | (Omit<CommandEnvelope<Record<string, unknown>>, 'type' | 'version'> & { type: 'order.refund'; version: number })
  | (Omit<CommandEnvelope<Record<string, unknown>>, 'type' | 'version'> & { type: 'order.reopen'; version: number })
  | (Omit<CommandEnvelope<Record<string, unknown>>, 'type' | 'version'> & { type: 'order.update'; version: number })

/** Validates every envelope before any command is claimed. */
export function validateBatch(body: unknown):
  | { ok: true; commands: ValidatedCommandEnvelope[] }
  | { ok: false; status: 400; message: string }
  | { ok: false; status: 413; message: string; body: BatchTooLargeBody } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, status: 400, message: 'Expected body object with commands array' }
  }
  const { commands } = body as Record<string, unknown>
  if (!Array.isArray(commands)) return { ok: false, status: 400, message: 'Expected commands array' }
  if (commands.length > MAX_COMMANDS_PER_BATCH) {
    const message = `At most ${MAX_COMMANDS_PER_BATCH} commands are allowed`
    return { ok: false, status: 413, message, body: { code: 'batch_too_large', maxCommands: MAX_COMMANDS_PER_BATCH, message } }
  }
  if (commands.length === 0) return { ok: false, status: 400, message: 'commands must not be empty' }
  for (const [index, command] of commands.entries()) {
    if (typeof command !== 'object' || command === null || Array.isArray(command)) {
      return { ok: false, status: 400, message: `Invalid commands[${index}]: expected object` }
    }
    let field: string | undefined
    if (typeof command.id !== 'string' || command.id.length === 0 || command.id.length > 64) field = 'id'
    else if (!['order.create', 'order.refund', 'order.reopen', 'order.update', 'register.session.open', 'register.session.transition', 'register.movement.record',
      'register.movement.void', 'register.closure.submit'].includes(command.type)) field = 'type'
    else if (!Number.isSafeInteger(command.version) || command.version < 1) field = 'version'
    else if (typeof command.payload !== 'object' || command.payload === null || Array.isArray(command.payload)) field = 'payload'
    else if (typeof command.createdAt !== 'string') field = 'createdAt'
    else if (typeof command.deviceId !== 'string') field = 'deviceId'
    else if (!Number.isSafeInteger(command.attempt) || command.attempt < 1) field = 'attempt'
    if (field) return { ok: false, status: 400, message: `Invalid commands[${index}].${field}` }
  }
  return { ok: true, commands }
}

// A rejected result; `data` is set only when given, so an invalid_payload error has no data key.
const rejected = (id: string, code: 'unsupported_version' | 'invalid_payload', message: string, data?: Record<string, number>): CommandResult =>
  ({ id, status: 'rejected', error: data === undefined ? { code, message } : { code, message, data } })
// A server lists at most ten payload errors in one message.
const firstTen = (errors: readonly string[]) => errors.slice(0, 10).join('; ')
// The `invalid_payload` result for a shape function's errors, or undefined when there are none.
const shapeRefusal = (id: string, errors: readonly string[]) => errors.length ? rejected(id, 'invalid_payload', firstTen(errors)) : undefined

/** The `unsupported_version` result for a command whose version list the server may leave out (absent or empty: it takes none). */
function unsupportedOptional(envelope: { id: string; type: string; version: number },
  key: 'orderRefund' | 'orderReopen' | 'orderUpdate', versions: readonly number[], noun: string): CommandResult | undefined {
  if (versions.includes(envelope.version)) return undefined
  return rejected(envelope.id, 'unsupported_version',
    `${envelope.type} version ${envelope.version} is not supported; this server ${versions.length ? `supports ${versions.join(', ')}` : `takes no ${noun}`}`,
    { [key]: versions.length ? Math.max(...versions) : 0 })
}

/**
 * The rejection a batch returns for this command before any executor runs, or undefined
 * when the command goes on to the plugin's executor. A plugin's batch handler calls
 * validateBatch once, then, for each command in order: the shape check (payloadShapeErrors:
 * types and NUL) first, before any database access, because a NUL in clientOrderId would make
 * the lookup itself fail; then the plugin's own replay and collision lookups; then
 * precheckCommand (versions, string lengths via payloadBoundErrors, fiscal figures); then the
 * claim, in the executor (order.create; register commands follow ADR-068). It pushes any result
 * one of those steps returns and moves on.
 *
 * For order.update the shape check is updatePayloadErrors (ADR-090): it adds the update's store ids; for order.refund
 * refundPayloadErrors, for order.reopen reopenPayloadErrors, for a register command registerPayloadErrors.
 * precheckCommand repeats the shape check for every command type at every version, after the version answer, as a
 * backstop (#1344, #1346): for order.update's create part too.
 *
 * The replay lookup goes before precheckCommand so an already-applied command always replays
 * as `duplicate`, even once a later @tallyui/core tightens what precheckCommand accepts.
 *
 * `supported` is the SERVER's own list (what its /info advertises), never core's constants, which are the
 * till's capability (#297). The version check, the `unsupported_version` message and its `data` all use it:
 * `precheckCommand(envelope, { orderCreate: [1, 2, 3], register: [1], orderRefund: [1], orderReopen: [1], orderUpdate: [1] })` (`orderRefund`, `orderReopen` and `orderUpdate` are optional).
 * `cashRounding` is the server's own word too (ADR-094): without `true`, an order.create (or an order.update's create part)
 * carrying `cashRoundings` is refused as `invalid_payload`, never sent on with the field dropped, which would be a wrong total.
 * `taxExempt` likewise requires the server's `taxExempt` capability on order.create and is always refused on order.update.
 * A tax-exempt order.create carrying coupons also requires `taxExemptCoupons`.
 * Likewise, a fee or shipping charge carrying `amountIncludesTax` is refused unless the server declares `chargeTaxMode: true`.
 */
export function precheckCommand(envelope: Pick<AnyCommandEnvelope | ValidatedCommandEnvelope, 'id' | 'type' | 'version' | 'payload'>,
  supported: { orderCreate: readonly number[]; register: readonly number[]; orderRefund?: readonly number[]; orderReopen?: readonly number[]; orderUpdate?: readonly number[]; cashRounding?: boolean; chargeTaxMode?: boolean; taxExempt?: boolean; taxExemptCoupons?: boolean }): CommandResult | undefined {
  // An empty list would send Math.max() of nothing (-Infinity, null in JSON) as the server's version.
  for (const key of ['orderCreate', 'register'] as const) {
    if (!supported[key]?.length) throw new TypeError(`precheckCommand: supported.${key} must list at least one version`)
  }
  if (envelope.type === 'order.refund') {
    return unsupportedOptional(envelope, 'orderRefund', supported.orderRefund ?? [], 'refunds')
      ?? shapeRefusal(envelope.id, refundPayloadErrors(envelope.payload))
  }
  if (envelope.type === 'order.reopen') {
    return unsupportedOptional(envelope, 'orderReopen', supported.orderReopen ?? [], 'reopens')
      ?? shapeRefusal(envelope.id, reopenPayloadErrors(envelope.payload))
  }
  if (envelope.type === 'order.update') {
    const refusal = unsupportedOptional(envelope, 'orderUpdate', supported.orderUpdate ?? [], 'updates')
    if (refusal) return refusal
    const payload = envelope.payload as Record<string, unknown>
    const createPayload = orderCreatePart(payload)
    const shape = payloadShapeErrors(createPayload)
    const errors = updatePayloadErrors(payload).filter(error => !shape.includes(error))
    if (errors.length) return rejected(envelope.id, 'invalid_payload', firstTen(errors))
    if (createPayload.taxExempt !== undefined) return rejected(envelope.id, 'invalid_payload', 'taxExempt is not accepted on order.update')
    return precheckCommand({ id: envelope.id, type: 'order.create', version: payload.createVersion as number, payload: createPayload }, supported)
  }
  if (envelope.type !== 'order.create') {
    if (!supported.register.includes(envelope.version)) {
      return rejected(envelope.id, 'unsupported_version',
        `register version ${envelope.version} is not supported; this server supports ${supported.register.join(', ')}`,
        { register: Math.max(...supported.register) })
    }
    return shapeRefusal(envelope.id, registerPayloadErrors(envelope.type, envelope.payload))
  }
  const command = envelope as CommandEnvelope<OrderCreatePayload>
  if (!supported.orderCreate.includes(command.version)) {
    return rejected(command.id, 'unsupported_version',
      `order.create version ${command.version} is not supported; this server supports ${supported.orderCreate.join(', ')}`,
      { orderCreate: Math.max(...supported.orderCreate) })
  }
  if ((command.payload as { cashRoundings?: unknown }).cashRoundings !== undefined && supported.cashRounding !== true) {
    return rejected(command.id, 'invalid_payload', 'cashRoundings requires the cashRounding capability, which this server does not declare')
  }
  if (command.payload.taxExempt !== undefined && supported.taxExempt !== true) {
    return rejected(command.id, 'invalid_payload', 'taxExempt requires the taxExempt capability, which this server does not declare')
  }
  if (command.payload.taxExempt && command.payload.coupons?.length && supported.taxExemptCoupons !== true) {
    return rejected(command.id, 'invalid_payload', 'taxExempt with coupons requires the taxExemptCoupons capability, which this server does not declare')
  }
  if (supported.chargeTaxMode !== true && [command.payload.fees, command.payload.shipping].some(items =>
    Array.isArray(items) && items.some(entry => entry?.amountIncludesTax !== undefined))) {
    return rejected(command.id, 'invalid_payload', 'amountIncludesTax requires the chargeTaxMode capability, which this server does not declare')
  }
  // ADR-062 sends version 2 exactly when there is a discount, so version 1 can never create adjustments.
  const { lines, discountMinor } = command.payload as { lines?: unknown; discountMinor?: unknown }
  const discounted = discountMinor !== undefined
    || (Array.isArray(lines) && lines.some(line => (line as { discountMinor?: unknown } | null)?.discountMinor !== undefined))
  const payload = command.payload as OrderCreatePayload
  const { display, taxByRate, sessionId } = payload
  // Version 4 and later carry version 3's fields, with tax-exclusive discountMinor (#286).
  const v3 = command.version >= 3
  const v5Fields = ['fees', 'shipping'].filter(field => payload[field as 'fees' | 'shipping'] !== undefined)
  if (Array.isArray(lines)) lines.forEach((line, index) => {
    if (line?.custom !== undefined) v5Fields.push(`lines[${index}].custom`)
  })
  for (const field of ['fees', 'shipping'] as const) if (display?.[field] !== undefined) v5Fields.push(`display.${field}`)
  const v6Fields = payload.coupons !== undefined ? ['coupons'] : []
  if (display?.coupons !== undefined) v6Fields.push('display.coupons')
  if (Array.isArray(lines)) lines.forEach((line, index) => {
    for (const field of ['regularUnitPriceMinor', 'attributes', 'anyAttributes'] as const) {
      if (line?.[field] !== undefined) v6Fields.push(`lines[${index}].${field}`)
    }
  })
  const coupons = Array.isArray(payload.coupons) ? payload.coupons.filter(coupon => typeof coupon === 'object' && coupon !== null && !Array.isArray(coupon)) : []
  const couponLines = coupons.filter(coupon => coupon.lines !== undefined)
  const couponsWithoutLines = coupons.filter(coupon => coupon.lines === undefined)
  const paymentsWithMethodId = Array.isArray(payload.payments) && payload.payments.some(payment =>
    typeof payment === 'object' && payment !== null && (payment as { methodId?: unknown }).methodId !== undefined)
  // Version 12 (ADR-092): informational fields, named in this order.
  const v12Fields = payload.customer?.taxIds !== undefined ? ['customer.taxIds'] : []
  if (Array.isArray(lines)) lines.forEach((line, index) => { if (line?.sku !== undefined) v12Fields.push(`lines[${index}].sku`) })
  if (payload.meta !== undefined) v12Fields.push('meta')
  let versionError = command.version < 5 && v5Fields.length ? v5Fields.map(field => `${field} requires version 5`).join('; ')
    : command.version < 6 && v6Fields.length ? v6Fields.map(field => `${field} requires version 6`).join('; ')
    : command.version < 7 && payload.note !== undefined ? 'note requires version 7'
    : command.version < 8 && payload.taxAddress !== undefined ? 'taxAddress requires version 8'
    : command.version < 8 && (payload.customer?.billing !== undefined || payload.customer?.shipping !== undefined)
      ? 'customer address requires version 8'
    : command.version < 9 && couponLines.length ? 'coupons[].lines requires version 9'
    : command.version < 10 && paymentsWithMethodId ? 'payments[].methodId requires version 10'
    : command.version < 12 && v12Fields.length ? v12Fields.map(field => `${field} requires version 12`).join('; ')
    : command.version >= 9 && couponsWithoutLines.length ? 'version 9 requires coupons[].lines'
    : command.version === 8 && payload.taxAddress === undefined ? 'version 8 requires taxAddress'
    : command.version >= 9 && command.version < 11 && payload.taxAddress === undefined && (payload.customer?.billing !== undefined || payload.customer?.shipping !== undefined)
      ? 'version 9 customer address requires taxAddress'
    : command.version === 2 && discountMinor === undefined ? 'version 2 requires discountMinor'
    : command.version === 1 && discounted ? 'discountMinor requires version 2'
    : !v3 && (display !== undefined || taxByRate !== undefined) ? 'display and taxByRate require version 3'
    : !v3 && sessionId !== undefined ? 'sessionId requires version 3'
    : !v3 && payload.customer?.customerId !== undefined ? 'customerId requires version 3'
    : v3 && (display !== undefined) !== (taxByRate !== undefined) ? 'display and taxByRate must both be present or both absent'
    : undefined
  if (!versionError && Array.isArray(lines)) for (const [index, line] of lines.entries()) {
    if (line?.custom === undefined && (typeof line?.variantId !== 'string' || !line.variantId.length)) {
      versionError = `lines[${index}].variantId is required`
    } else if (command.version >= 5 && line?.custom !== undefined && line.variantId !== undefined) {
      versionError = `lines[${index}] has custom and variantId; a custom line has no variantId`
    }
    if (versionError) break
  }
  if (versionError) {
    return rejected(command.id, 'invalid_payload', versionError)
  }
  const bounds = payloadBoundErrors(payload)
  if (bounds.length) {
    return rejected(command.id, 'invalid_payload', firstTen(bounds))
  }
  const shape = payloadShapeErrors(payload)
  const errors = shape.length ? shape
    : v3 && display !== undefined && taxByRate !== undefined ? fiscalFiguresErrors(payload) : []
  if (errors.length) {
    return rejected(command.id, 'invalid_payload', firstTen(errors))
  }
  return undefined
}
