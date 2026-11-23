import type { CommandBatchResponse } from '../types'
import { NEEDS_ADMIN_MESSAGE_MAX } from '../commands'

/**
 * A plugin's batch handler stops at the first in-progress or transient command and returns that
 * outcome for the whole batch; otherwise it returns 200 with every result in order.
 */
export type BatchOutcome =
  | { status: 200; body: CommandBatchResponse }
  | { status: 409; body: { code: 'in_progress'; id: string } }
  | { status: 409; body: { code: 'needs_admin'; id: string; reason: string; message: string } }
  | { status: 503; body: { code: 'transient'; id: string; message: 'Temporary failure, retry later.' } }

export function inProgressOutcome(id: string): BatchOutcome {
  return { status: 409, body: { code: 'in_progress', id } }
}

/** A command an admin must finish (TallyUI #1280). `reason` is snake_case; `message` is cut to NEEDS_ADMIN_MESSAGE_MAX. */
export function needsAdminOutcome(id: string, reason: string, message: string): BatchOutcome {
  return { status: 409, body: { code: 'needs_admin', id, reason, message: message.slice(0, NEEDS_ADMIN_MESSAGE_MAX) } }
}

/** The message is fixed so a server never leaks its internal error (log that separately). */
export function transientOutcome(id: string): BatchOutcome {
  return { status: 503, body: { code: 'transient', id, message: 'Temporary failure, retry later.' } }
}
