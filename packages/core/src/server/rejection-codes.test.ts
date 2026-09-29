// @vitest-environment node
import { expect, it } from 'vitest'
import { parseCommandResult } from './command-result'
import { platformErrorResult } from './rejection-codes'

it('builds the platform_error rejection with the platform details in data', () => {
  expect(platformErrorResult('cmd-1', 'NOT_FOUND', 'Order not found')).toStrictEqual({
    id: 'cmd-1',
    status: 'rejected',
    error: { code: 'platform_error', message: 'NOT_FOUND: Order not found', data: { platformCode: 'NOT_FOUND', platformMessage: 'Order not found' } },
  })
})

it('round-trips through parseCommandResult unchanged, since it is stored and replayed', () => {
  const result = platformErrorResult('cmd-1', 'NOT_FOUND', 'Order not found')
  // mirrors a ledger read: the result was serialised to storage and back
  expect(parseCommandResult(JSON.parse(JSON.stringify(result)))).toStrictEqual(result)
})
