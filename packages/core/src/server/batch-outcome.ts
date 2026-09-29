import type { CommandBatchResponse } from '../types'

/**
 * A plugin's batch handler stops at the first in-progress or transient command and returns that
 * outcome for the whole batch; otherwise it returns 200 with every result in order.
 */
export type BatchOutcome =
  | { status: 200; body: CommandBatchResponse }
  | { status: 409; body: { code: 'in_progress'; id: string } }
  | { status: 503; body: { code: 'transient'; id: string; message: 'Temporary failure, retry later.' } }

export function inProgressOutcome(id: string): BatchOutcome {
  return { status: 409, body: { code: 'in_progress', id } }
}

/** The message is fixed so a server never leaks its internal error (log that separately). */
export function transientOutcome(id: string): BatchOutcome {
  return { status: 503, body: { code: 'transient', id, message: 'Temporary failure, retry later.' } }
}
