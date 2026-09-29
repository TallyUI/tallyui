import type { RegisterCommandResult } from '../types'

export type RegisterConflictCode =
  | 'register_session_already_open'
  | 'register_session_closed'
  | 'register_closure_exists'
  | 'register_closure_number_invalid'

export type RegisterOutcome =
  | { kind: 'ok'; register: RegisterCommandResult }
  | { kind: 'conflict'; code: RegisterConflictCode; data?: Record<string, unknown> }
  | { kind: 'invalid'; message: string }
