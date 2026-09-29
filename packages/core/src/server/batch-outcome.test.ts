// @vitest-environment node
import { expect, it } from 'vitest'
import { inProgressOutcome, transientOutcome } from './batch-outcome'

it('builds the in-progress outcome', () => {
  expect(inProgressOutcome('cmd-1')).toStrictEqual({ status: 409, body: { code: 'in_progress', id: 'cmd-1' } })
})

it('builds the transient outcome with the fixed message', () => {
  expect(transientOutcome('cmd-1')).toStrictEqual({
    status: 503,
    body: { code: 'transient', id: 'cmd-1', message: 'Temporary failure, retry later.' },
  })
})
