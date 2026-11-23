// @vitest-environment node
import { expect, it } from 'vitest'
import { inProgressOutcome, needsAdminOutcome, transientOutcome } from './batch-outcome'

it('builds the in-progress outcome', () => {
  expect(inProgressOutcome('cmd-1')).toStrictEqual({ status: 409, body: { code: 'in_progress', id: 'cmd-1' } })
})

it('builds the needs-admin outcome', () => {
  expect(needsAdminOutcome('c1', 'session_closed', 'm')).toStrictEqual({
    status: 409, body: { code: 'needs_admin', id: 'c1', reason: 'session_closed', message: 'm' },
  })
})

it('cuts the needs-admin message to 500 UTF-16 units', () => {
  expect(needsAdminOutcome('c1', 'session_closed', 'm'.repeat(501))).toStrictEqual({
    status: 409, body: { code: 'needs_admin', id: 'c1', reason: 'session_closed', message: 'm'.repeat(500) },
  })
})

it('builds the transient outcome with the fixed message', () => {
  expect(transientOutcome('cmd-1')).toStrictEqual({
    status: 503,
    body: { code: 'transient', id: 'cmd-1', message: 'Temporary failure, retry later.' },
  })
})
