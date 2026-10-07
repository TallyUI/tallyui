import { describe, expectTypeOf, it } from 'vitest'
import type { BatchTooLargeBody, OrderCreateEnvelope, RegisterCommandEnvelope } from '../types'
import { precheckCommand, validateBatch, type ValidatedCommandEnvelope } from './batch'
import { commandFingerprint } from './fingerprint'
import type { CommandRejectionCode } from './rejection-codes'

describe('server envelope types', () => {
  it("types validateBatch's accepted commands as ValidatedCommandEnvelope", () => {
    const result = validateBatch({})
    if (result.ok) {
      expectTypeOf(result.commands[0]).toEqualTypeOf<ValidatedCommandEnvelope>()
    }
  })

  it('carries body on the 413 failure only', () => {
    const result = validateBatch({})
    if (!result.ok && result.status === 413) expectTypeOf(result.body).toEqualTypeOf<BatchTooLargeBody>()
    if (!result.ok && result.status === 400) expectTypeOf(result).not.toHaveProperty('body')
  })

  it('narrows on the type discriminant', () => {
    const envelope = {} as ValidatedCommandEnvelope
    if (envelope.type === 'order.create') {
      expectTypeOf(envelope.version).toEqualTypeOf<number>()
    } else {
      expectTypeOf(envelope).toEqualTypeOf<RegisterCommandEnvelope<Record<string, unknown>>>()
    }
  })

  it('precheckCommand accepts a register, an order.create and a validated envelope without a cast', () => {
    const server = { orderCreate: [1, 2, 3], register: [1] } as const
    precheckCommand({} as RegisterCommandEnvelope, server)
    precheckCommand({} as OrderCreateEnvelope, server)
    precheckCommand({} as ValidatedCommandEnvelope, server)
  })

  it("precheckCommand requires the server's own supported lists (#297)", () => {
    // @ts-expect-error no supported lists
    precheckCommand({} as OrderCreateEnvelope)
    // @ts-expect-error a register list is required too
    precheckCommand({} as OrderCreateEnvelope, { orderCreate: [1] })
  })

  it('commandFingerprint accepts a register envelope without a cast', () => {
    commandFingerprint({} as RegisterCommandEnvelope)
  })

  it('precheckCommand rejects an unknown command type and a non-object argument', () => {
    // @ts-expect-error unknown command type
    precheckCommand({ id: 'x', type: 'unknown.command', version: 1, payload: {} }, { orderCreate: [1], register: [1] })
    // @ts-expect-error non-object argument
    precheckCommand('not an envelope', { orderCreate: [1], register: [1] })
  })

  it('commandFingerprint rejects a non-object argument', () => {
    // @ts-expect-error non-object argument
    commandFingerprint('not an envelope')
  })

  it("'platform_error' is a CommandRejectionCode", () => {
    expectTypeOf<'platform_error'>().toExtend<CommandRejectionCode>()
  })

  it('pins the whole CommandRejectionCode union', () => {
    expectTypeOf<CommandRejectionCode>().toEqualTypeOf<
      | 'invalid_payload' | 'unsupported_version' | 'idempotency_mismatch' | 'store_configuration' | 'platform_error'
      | 'insufficient_stock' | 'unsupported_tax_mode' | 'internal_error'
      | 'coupon_invalid' | 'total_mismatch'
      | 'unknown_variant' | 'invalid_quantity' | 'underpaid' | 'unsupported_currency'
      | 'register_session_already_open' | 'register_session_superseded' | 'register_supersede_forbidden'
      | 'register_session_closed' | 'register_closure_exists' | 'register_closure_number_invalid'
    >()
  })
})
