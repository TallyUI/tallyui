import type { AnyCommandEnvelope, CommandEnvelope, CommandResult, OrderCreatePayload, RegisterCommandEnvelope } from '../types'
import { fiscalFiguresErrors, type OrderCreatePayloadV3 } from './fiscal-figures'
import { payloadShapeErrors } from './order-payload-shape'
import { SUPPORTED_ORDER_CREATE_VERSIONS, SUPPORTED_REGISTER_VERSIONS } from './versions'

/** An envelope validateBatch accepted: every field's shape is checked, and its version is any positive
 *  safe integer (precheckCommand decides which versions this server supports). */
export type ValidatedCommandEnvelope =
  | (Omit<CommandEnvelope<Record<string, unknown>>, 'version'> & { type: 'order.create'; version: number })
  | RegisterCommandEnvelope<Record<string, unknown>>

/** Validates every envelope before any command is claimed. */
export function validateBatch(body: unknown):
  | { ok: true; commands: ValidatedCommandEnvelope[] }
  | { ok: false; status: 400 | 413; message: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, status: 400, message: 'Expected body object with commands array' }
  }
  const { commands } = body as Record<string, unknown>
  if (!Array.isArray(commands)) return { ok: false, status: 400, message: 'Expected commands array' }
  if (commands.length > 50) return { ok: false, status: 413, message: 'At most 50 commands are allowed' }
  if (commands.length === 0) return { ok: false, status: 400, message: 'commands must not be empty' }
  for (const [index, command] of commands.entries()) {
    if (typeof command !== 'object' || command === null || Array.isArray(command)) {
      return { ok: false, status: 400, message: `Invalid commands[${index}]: expected object` }
    }
    let field: string | undefined
    if (typeof command.id !== 'string' || command.id.length === 0 || command.id.length > 64) field = 'id'
    else if (!['order.create', 'register.session.open', 'register.session.transition', 'register.movement.record',
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

/**
 * The rejection a batch returns for this command before any executor runs, or undefined
 * when the command goes on to the plugin's executor. A plugin's batch handler calls
 * validateBatch once, then, for each command in order, its own replay lookup first and
 * precheckCommand after: it pushes any result either of them returns and moves on, and
 * otherwise runs its own executor. The payload shape check (payloadShapeErrors) and the
 * ledger stay in the plugin's executor.
 *
 * The replay lookup goes first so an already-applied command always replays as `duplicate`,
 * even once a later @tallyui/core tightens what precheckCommand accepts.
 */
export function precheckCommand(envelope: Pick<AnyCommandEnvelope | ValidatedCommandEnvelope, 'id' | 'type' | 'version' | 'payload'>): CommandResult | undefined {
  if (envelope.type !== 'order.create') {
    if (!SUPPORTED_REGISTER_VERSIONS.includes(envelope.version)) {
      return { id: envelope.id, status: 'rejected', error: { code: 'unsupported_version',
        message: `register version ${envelope.version} is not supported; this server supports ${SUPPORTED_REGISTER_VERSIONS.join(', ')}`,
        data: { register: Math.max(...SUPPORTED_REGISTER_VERSIONS) },
      } }
    }
    return undefined
  }
  const command = envelope as CommandEnvelope<OrderCreatePayload>
  if (!SUPPORTED_ORDER_CREATE_VERSIONS.includes(command.version)) {
    return { id: command.id, status: 'rejected', error: { code: 'unsupported_version',
      message: `order.create version ${command.version} is not supported; this server supports ${SUPPORTED_ORDER_CREATE_VERSIONS.join(', ')}`,
      data: { orderCreate: Math.max(...SUPPORTED_ORDER_CREATE_VERSIONS) },
    } }
  }
  // ADR-062 sends version 2 exactly when there is a discount, so version 1 can never create adjustments.
  const { lines, discountMinor } = command.payload as { lines?: unknown; discountMinor?: unknown }
  const discounted = discountMinor !== undefined
    || (Array.isArray(lines) && lines.some(line => (line as { discountMinor?: unknown } | null)?.discountMinor !== undefined))
  const payload = command.payload as OrderCreatePayloadV3
  const { display, taxByRate, sessionId } = payload
  const v3 = (command.version as number) === 3
  const versionError = command.version === 2 && discountMinor === undefined ? 'version 2 requires discountMinor'
    : command.version === 1 && discounted ? 'discountMinor requires version 2'
    : !v3 && (display !== undefined || taxByRate !== undefined) ? 'display and taxByRate require version 3'
    : !v3 && sessionId !== undefined ? 'sessionId requires version 3'
    : !v3 && payload.customer?.customerId !== undefined ? 'customerId requires version 3'
    : v3 && (display !== undefined) !== (taxByRate !== undefined) ? 'display and taxByRate must both be present or both absent'
    : undefined
  if (versionError) {
    return { id: command.id, status: 'rejected', error: { code: 'invalid_payload', message: versionError } }
  }
  const errors = v3 && display !== undefined && taxByRate !== undefined && payloadShapeErrors(payload).length === 0
    ? fiscalFiguresErrors(payload) : []
  if (errors.length) {
    return { id: command.id, status: 'rejected', error: { code: 'invalid_payload', message: errors.slice(0, 10).join('; ') } }
  }
  return undefined
}
