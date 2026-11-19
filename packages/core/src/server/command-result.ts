import type { CommandResult, RegisterCommandResult } from '../types'

/** parseCommandResult's refusal; its message names the first bad field. A plugin maps it
 *  to its own invalid-data error (e.g. Medusa's MedusaError INVALID_DATA). */
export class CommandResultError extends Error {
  constructor(message: string) { super(message); this.name = 'CommandResultError' }
}

/** Validates a CommandResult (e.g. one read back from the ledger). Throws
 *  CommandResultError naming the first bad field. */
export function parseCommandResult(value: unknown): CommandResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CommandResultError('Invalid result: expected object')
  }
  const input = value as Record<string, unknown>
  if (typeof input.id !== 'string' || input.id.length === 0) {
    throw new CommandResultError('Invalid id')
  }
  if (input.status !== 'applied' && input.status !== 'duplicate' && input.status !== 'rejected') {
    throw new CommandResultError('Invalid status')
  }
  const result: CommandResult = { id: input.id, status: input.status }
  const object = (value: unknown): boolean => typeof value === 'object' && value !== null
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  if (input.serverRefs !== undefined) {
    if (typeof input.serverRefs !== 'object' || input.serverRefs === null || Array.isArray(input.serverRefs)) {
      throw new CommandResultError('Invalid serverRefs')
    }
    const refs = input.serverRefs as Record<string, unknown>
    if (typeof refs.orderId !== 'string' || refs.orderId.length === 0) {
      throw new CommandResultError('Invalid serverRefs.orderId')
    }
    if (refs.displayId !== undefined && typeof refs.displayId !== 'string') {
      throw new CommandResultError('Invalid serverRefs.displayId')
    }
    if (!Number.isSafeInteger(refs.totalMinor)) {
      throw new CommandResultError('Invalid serverRefs.totalMinor')
    }
    result.serverRefs = { orderId: refs.orderId, totalMinor: refs.totalMinor as number }
    if (refs.displayId !== undefined) result.serverRefs.displayId = refs.displayId as string
  }
  if (input.register !== undefined) {
    if (!object(input.register)) throw new CommandResultError('Invalid register')
    result.register = input.register as RegisterCommandResult
  }
  if (input.refund !== undefined) {
    if (!object(input.refund)) throw new CommandResultError('Invalid refund')
    const refund = input.refund as Record<string, unknown>
    if (!Number.isSafeInteger(refund.totalMinor) || (refund.totalMinor as number) < 0) throw new CommandResultError('Invalid refund.totalMinor')
    if (!object(refund.byMethod)) throw new CommandResultError('Invalid refund.byMethod')
    const byMethod = Object.fromEntries(Object.entries(refund.byMethod as Record<string, unknown>).map(([key, amount]) => {
      if (!key.length) throw new CommandResultError('Invalid refund.byMethod')
      if (!Number.isSafeInteger(amount) || (amount as number) < 0) throw new CommandResultError(`Invalid refund.byMethod.${key}`)
      return [key, amount as number]
    }))
    if (Object.values(byMethod).reduce((sum, amount) => sum + amount, 0) !== refund.totalMinor) throw new CommandResultError('Invalid refund.byMethod')
    if (!Array.isArray(refund.refunds) || refund.refunds.length === 0) throw new CommandResultError('Invalid refund.refunds')
    const refunds = refund.refunds.map((value: unknown, index) => {
      const field = `refund.refunds[${index}]`
      if (!object(value)) throw new CommandResultError(`Invalid ${field}`)
      const entry = value as Record<string, unknown>
      for (const key of ['id', 'paymentId']) {
        if (typeof entry[key] !== 'string' || entry[key].length === 0) throw new CommandResultError(`Invalid ${field}.${key}`)
      }
      if (!Number.isSafeInteger(entry.totalMinor) || (entry.totalMinor as number) < 0) throw new CommandResultError(`Invalid ${field}.totalMinor`)
      if (typeof entry.state !== 'string' || entry.state.length === 0) throw new CommandResultError(`Invalid ${field}.state`)
      return { id: entry.id as string, paymentId: entry.paymentId as string, totalMinor: entry.totalMinor as number, state: entry.state }
    })
    if (refunds.reduce((sum, entry) => sum + entry.totalMinor, 0) !== refund.totalMinor) throw new CommandResultError('Invalid refund.refunds')
    result.refund = { totalMinor: refund.totalMinor as number, byMethod, refunds }
  }
  if (input.reopen !== undefined) {
    if (!object(input.reopen)) throw new CommandResultError('Invalid reopen')
    const reopen = input.reopen as Record<string, unknown>
    if (typeof reopen.orderId !== 'string' || reopen.orderId.length === 0) throw new CommandResultError('Invalid reopen.orderId')
    if (typeof reopen.status !== 'string' || reopen.status.length === 0) throw new CommandResultError('Invalid reopen.status')
    if (reopen.revision !== undefined && (typeof reopen.revision !== 'string' || reopen.revision.length === 0)) throw new CommandResultError('Invalid reopen.revision')
    result.reopen = { orderId: reopen.orderId, status: reopen.status }
    if (reopen.revision !== undefined) result.reopen.revision = reopen.revision as string
  }
  if (result.status === 'applied' && result.serverRefs === undefined && result.register === undefined && result.refund === undefined && result.reopen === undefined) {
    throw new CommandResultError('Invalid serverRefs: required for applied')
  }
  if (input.warnings !== undefined) {
    if (!Array.isArray(input.warnings)) {
      throw new CommandResultError('Invalid warnings')
    }
    result.warnings = input.warnings.map((warning: unknown, index) => {
      const field = `warnings[${index}]`
      if (typeof warning !== 'object' || warning === null || Array.isArray(warning)) {
        throw new CommandResultError(`Invalid ${field}`)
      }
      const item = warning as Record<string, unknown>
      if (item.code === 'total_mismatch') {
        for (const key of ['expectedMinor', 'serverMinor']) {
          if (!Number.isInteger(item[key])) {
            throw new CommandResultError(`Invalid ${field}.${key}`)
          }
        }
        if (item.bridgeMinor != null && !Number.isSafeInteger(item.bridgeMinor)) {
          throw new CommandResultError(`Invalid ${field}.bridgeMinor`)
        }
        return item.bridgeMinor != null
          ? { code: item.code, expectedMinor: item.expectedMinor as number, serverMinor: item.serverMinor as number, bridgeMinor: item.bridgeMinor as number }
          : { code: item.code, expectedMinor: item.expectedMinor as number, serverMinor: item.serverMinor as number }
      }
      if (item.code === 'insufficient_stock') {
        if (typeof item.variantId !== 'string' || item.variantId.length === 0) {
          throw new CommandResultError(`Invalid ${field}.variantId`)
        }
        if (!Number.isInteger(item.quantity) || (item.quantity as number) < 1) {
          throw new CommandResultError(`Invalid ${field}.quantity`)
        }
        return { code: item.code, variantId: item.variantId, quantity: item.quantity as number }
      }
      if (item.code === 'tax_rate_mismatch') {
        if (!Number.isSafeInteger(item.ratePpm) || (item.ratePpm as number) < 0) {
          throw new CommandResultError(`Invalid ${field}.ratePpm`)
        }
        for (const key of ['expectedMinor', 'serverMinor']) {
          if (!Number.isSafeInteger(item[key])) {
            throw new CommandResultError(`Invalid ${field}.${key}`)
          }
        }
        return { code: item.code, ratePpm: item.ratePpm as number, expectedMinor: item.expectedMinor as number, serverMinor: item.serverMinor as number }
      }
      if (item.code === 'customer_ignored') {
        if (typeof item.customerId !== 'string' || item.customerId.length === 0 || item.customerId.length > 64) {
          throw new CommandResultError(`Invalid ${field}.customerId`)
        }
        return { code: item.code, customerId: item.customerId }
      }
      if (item.code === 'register_session_unknown') {
        if (typeof item.sessionId !== 'string' || item.sessionId.length === 0 || item.sessionId.length > 64) {
          throw new CommandResultError(`Invalid ${field}.sessionId`)
        }
        return { code: item.code, sessionId: item.sessionId }
      }
      if (item.code === 'figures_mismatch') {
        if (!Array.isArray(item.fields) || item.fields.length === 0) throw new CommandResultError(`Invalid ${field}.fields`)
        const seen: string[] = []
        return { code: item.code, fields: item.fields.map((value: unknown, i) => {
          const path = `${field}.fields[${i}]`
          if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new CommandResultError(`Invalid ${path}`)
          const entry = value as Record<string, unknown>
          if (!['subtotalMinor', 'taxMinor', 'discountMinor'].includes(entry.field as string) || seen.includes(entry.field as string)) {
            throw new CommandResultError(`Invalid ${path}.field`)
          }
          seen.push(entry.field as string)
          if (!Number.isSafeInteger(entry.tillMinor)) throw new CommandResultError(`Invalid ${path}.tillMinor`)
          if (!Number.isSafeInteger(entry.serverMinor) || entry.serverMinor === entry.tillMinor) throw new CommandResultError(`Invalid ${path}.serverMinor`)
          return { field: entry.field as 'subtotalMinor' | 'taxMinor' | 'discountMinor', tillMinor: entry.tillMinor as number, serverMinor: entry.serverMinor as number }
        }) }
      }
      if (item.code === 'line_figures_mismatch') {
        if (!Array.isArray(item.lines) || item.lines.length === 0) throw new CommandResultError(`Invalid ${field}.lines`)
        const seen: string[] = []
        return { code: item.code, lines: item.lines.map((value: unknown, i) => {
          const path = `${field}.lines[${i}]`
          if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new CommandResultError(`Invalid ${path}`)
          const entry = value as Record<string, unknown>
          if (typeof entry.lineId !== 'string' || entry.lineId.length === 0 || entry.lineId.length > 64) throw new CommandResultError(`Invalid ${path}.lineId`)
          const key = JSON.stringify([entry.lineId, entry.field])
          if (!['subtotalMinor', 'taxMinor', 'discountMinor', 'totalMinor'].includes(entry.field as string) || seen.includes(key)) {
            throw new CommandResultError(`Invalid ${path}.field`)
          }
          seen.push(key)
          if (!Number.isSafeInteger(entry.tillMinor)) throw new CommandResultError(`Invalid ${path}.tillMinor`)
          if (!Number.isSafeInteger(entry.serverMinor) || entry.serverMinor === entry.tillMinor) throw new CommandResultError(`Invalid ${path}.serverMinor`)
          return { lineId: entry.lineId, field: entry.field as 'subtotalMinor' | 'taxMinor' | 'discountMinor' | 'totalMinor', tillMinor: entry.tillMinor as number, serverMinor: entry.serverMinor as number }
        }) }
      }
      throw new CommandResultError(`Invalid ${field}.code`)
    })
  }
  if (input.error !== undefined) {
    if (typeof input.error !== 'object' || input.error === null || Array.isArray(input.error)) {
      throw new CommandResultError('Invalid error')
    }
    const error = input.error as Record<string, unknown>
    if (typeof error.code !== 'string' || error.code.length === 0) {
      throw new CommandResultError('Invalid error.code')
    }
    if (typeof error.message !== 'string') {
      throw new CommandResultError('Invalid error.message')
    }
    result.error = { code: error.code, message: error.message }
    if (error.data !== undefined) {
      if (!object(error.data)) throw new CommandResultError('Invalid error.data')
      result.error.data = error.data as Record<string, unknown>
    }
  }
  if (result.status === 'rejected' && result.error === undefined) {
    throw new CommandResultError('Invalid error: required for rejected')
  }
  return result
}
