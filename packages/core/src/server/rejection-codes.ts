import type { CommandResult } from '../types'
import type { OrderRejectionCode } from './total-warnings'
import type { RegisterConflictCode } from './register-outcome'

/** Every error.code a plugin may put on a rejected result (ADR-038 and its amendments, ADR-068),
 *  except `register_approval_required`, which arrives with registers c2c. */
export type CommandRejectionCode =
  | 'invalid_payload' | 'unsupported_version' | 'idempotency_mismatch' | 'store_configuration' | 'platform_error'
  | 'insufficient_stock' | 'unsupported_tax_mode'
  | OrderRejectionCode | RegisterConflictCode

/**
 * The rejected result for a platform-native error the plugin has judged permanent (a replay would fail
 * the same way, e.g. a Vendure ErrorResult code) and the contract has no code for. `platform_error` is
 * for `order.create` only, for now: a rejected register command halts that register's queue until c2c,
 * so register refusals use the ADR-068 codes.
 *
 * Return it only when the platform made no durable change for this command: the plugin threw so its
 * transaction rolled back, or it compensated. Otherwise the plugin applies the command, with a warning
 * where one fits, or stays transient — the till offers Retry for `platform_error`, and requeue resends
 * under a new command id, which would duplicate a sale that had partly been written.
 *
 * It is stored in the ledger and replayed as recorded; the order shows under "Needs attention" with
 * Retry. An error the plugin can't classify stays transient (503, retried), never platform_error.
 */
export function platformErrorResult(id: string, platformCode: string, platformMessage: string): CommandResult {
  return { id, status: 'rejected', error: { code: 'platform_error', message: `${platformCode}: ${platformMessage}`, data: { platformCode, platformMessage } } }
}
