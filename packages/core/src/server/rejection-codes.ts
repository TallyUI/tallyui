import type { CommandResult } from '../types'
import type { OrderRejectionCode } from './total-warnings'
import type { RegisterConflictCode } from './register-outcome'

/** Every error.code a plugin may put on a rejected result (ADR-038 and its amendments, ADR-068),
 *  except `register_approval_required`, which arrives with registers c2c. */
export type CommandRejectionCode =
  | 'invalid_payload' | 'unsupported_version' | 'idempotency_mismatch' | 'store_configuration' | 'platform_error'
  | 'insufficient_stock' | 'unsupported_tax_mode' | 'internal_error'
  // Both are order.create v6 refusals (ADR-077 d4).
  | 'coupon_invalid' | 'total_mismatch'
  | OrderRejectionCode | RegisterConflictCode

/**
 * The rejected result for a platform-native error the plugin has judged permanent (a replay would fail
 * the same way, e.g. a Vendure ErrorResult code) and the contract has no code for. `platform_error` is
 * for `order.create` only, for now: a rejected register command halts that register's queue until c2c,
 * so register refusals use the ADR-068 codes.
 *
 * Return it only when the platform made no durable change for this command: the plugin threw so its
 * transaction rolled back, or it compensated. Otherwise the plugin applies the command (with a warning
 * where one fits), or compensates the partial write and then stays transient (ADR-039). The till offers
 * Retry for `platform_error` and requeue resends under a new command id, and a transient result resends
 * the same id after the ledger claim is released, so either would duplicate a partly written sale.
 *
 * It is stored in the ledger and replayed as recorded; the order shows under "Needs attention" with
 * Retry. An error the plugin can't classify stays transient (503, retried), never platform_error.
 */
export function platformErrorResult(id: string, platformCode: string, platformMessage: string): CommandResult {
  return { id, status: 'rejected', error: { code: 'platform_error', message: `${platformCode}: ${platformMessage}`, data: { platformCode, platformMessage } } }
}

/**
 * The rejected result for an exception from the plugin's own code (a programming error, not the
 * database, the network, or an unknown SQLSTATE), raised after a complete rollback or a complete
 * compensation, so that nothing of the sale remains, in the database or outside it. "The plugin's own
 * code" excludes an error thrown from inside the platform SDK, the database client or the HTTP client.
 *
 * It is stored in the ledger and replayed as recorded, because it fails the same way on every retry
 * and a retry loop would hide the bug. The message is generic so no internal detail reaches the till;
 * the correlation id links it to the plugin's log.
 *
 * Database, network, unknown-SQLSTATE and any other unclassifiable errors stay transient (503), never
 * `internal_error`. `order.create` only, as for `platform_error`.
 *
 * See ADR-038's `internal_error` amendment (needs-admin on a failed compensation; on Vendure only
 * before the first write).
 */
export function internalErrorResult(id: string, correlationId: string): CommandResult {
  return { id, status: 'rejected', error: { code: 'internal_error', message: `Internal error (ref ${correlationId})`, data: { correlationId } } }
}
