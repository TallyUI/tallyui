// @vitest-environment node
import { expect, it } from 'vitest'
import { registerPayloadErrors } from '@tallyui/core/server'
import {
  closureCommand, movementCommand, sessionOpenCommand, sessionTransitionCommand,
  type CashMovement, type Closure, type RegisterSession,
} from '@tallyui/pos'
import closureLocalRow from '../../pos/src/register/__fixtures__/closure-local-row.json'

// What the till sends: pos's own command builders over rows shaped like its store writes them.
const closureRow = closureLocalRow as unknown as Closure
const pettyCash = (closureRow.breakdowns as { movements: CashMovement[] }).movements[0]
const session: RegisterSession = {
  id: '01926f3a-7c00-7000-8000-000000000001', register_id: '01926f3a-7c00-7000-8000-00000000000a', status: 'open',
  store_key: '1', business_day: '2026-09-11', opened_at_gmt: '2026-09-11T08:00:00Z', opened_by: '1',
  expected_float_minor: 10000, counted_float_minor: 9950, opening_variance_minor: -50,
}
const bareSession: RegisterSession = {
  id: session.id, register_id: session.register_id, status: 'open', opened_at_gmt: session.opened_at_gmt,
  store_key: null, opened_by: null, expected_float_minor: null, counted_float_minor: 0, opening_variance_minor: null,
}
const movement = (overrides: Partial<CashMovement>): CashMovement => ({
  ...pettyCash, session_id: session.id, id: '01926f3a-7c00-7000-8000-000000000021', ...overrides,
})

const commands = [
  sessionOpenCommand(session),
  sessionOpenCommand(bareSession),
  sessionTransitionCommand({ ...session, status: 'counting', status_at: '2026-09-11T16:45:00Z' }),
  sessionTransitionCommand({ ...session, status: 'closed', status_at: '2026-09-11T17:00:00Z',
    counted: { cash: 17800, card: 12000 }, closed_by: '1', approved_by: '2' }),
  sessionTransitionCommand({ ...bareSession, status: 'closed', status_at: '2026-09-11T17:00:00Z',
    counted: null, closed_by: null, approved_by: null }),
  movementCommand(movement({ type: 'paid_in', amountMinor: 2000, reason: 'Float top-up', voided_by: null })),
  movementCommand(movement({ id: pettyCash.id })),
  movementCommand(movement({ id: '01926f3a-7c00-7000-8000-000000000022', type: 'no_sale', amountMinor: 0,
    reason: 'Change for a customer', created_by: null, voided_by: null })),
  movementCommand(movement({ id: '01926f3a-7c00-7000-8000-000000000023', type: 'void', voids: pettyCash.id,
    voided_by: null })),
  closureCommand(closureRow),
  closureCommand({ ...closureRow, id: '01926f3a-7c00-7000-8000-000000000031', session_id: session.id,
    register_id: session.register_id, closed_by: null, breakdowns: {},
    order_ids: ['01926f3a-7c00-7000-8000-000000000041'], movement_ids: [pettyCash.id] }),
]

it('covers every register command type', () => {
  expect(new Set(commands.map(command => command.type))).toEqual(new Set([
    'register.session.open', 'register.session.transition', 'register.movement.record',
    'register.movement.void', 'register.closure.submit',
  ]))
})

it.each(commands.map(command => [command.key, command] as const))('the core check accepts command %# (%s)', (_key, command) => {
  expect(registerPayloadErrors(command.type, command.payload)).toEqual([])
})
