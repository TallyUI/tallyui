import { describe, expectTypeOf, it } from 'vitest'
import type { OrderCreateEnvelope, RegisterCommandEnvelope } from '../types'
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

  it('narrows on the type discriminant', () => {
    const envelope = {} as ValidatedCommandEnvelope
    if (envelope.type === 'order.create') {
      expectTypeOf(envelope.version).toEqualTypeOf<number>()
    } else {
      expectTypeOf(envelope).toEqualTypeOf<RegisterCommandEnvelope<Record<string, unknown>>>()
    }
  })

  it('precheckCommand accepts a register, an order.create and a validated envelope without a cast', () => {
    precheckCommand({} as RegisterCommandEnvelope)
    precheckCommand({} as OrderCreateEnvelope)
    precheckCommand({} as ValidatedCommandEnvelope)
  })

  it('commandFingerprint accepts a register envelope without a cast', () => {
    commandFingerprint({} as RegisterCommandEnvelope)
  })

  it('precheckCommand rejects an unknown command type and a non-object argument', () => {
    // @ts-expect-error unknown command type
    precheckCommand({ id: 'x', type: 'unknown.command', version: 1, payload: {} })
    // @ts-expect-error non-object argument
    precheckCommand('not an envelope')
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
      | 'unknown_variant' | 'invalid_quantity' | 'underpaid' | 'unsupported_currency'
      | 'register_session_already_open' | 'register_session_closed' | 'register_closure_exists' | 'register_closure_number_invalid'
    >()
  })
})
