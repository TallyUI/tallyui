// @vitest-environment node
import { expect, it } from 'vitest'
import type { CommandResult, RegisterApprovalRequiredData, RegisterApprovalInvalidData } from '../types'
import type { RegisterConflictCode } from './register-outcome'
import type { CommandRejectionCode } from './rejection-codes'
import { parseCommandResult } from './command-result'
import { internalErrorResult, platformErrorResult } from './rejection-codes'

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

it('builds the internal_error rejection with a generic message and the correlation id in data', () => {
  expect(internalErrorResult('cmd-1', 'corr-1')).toStrictEqual({
    id: 'cmd-1',
    status: 'rejected',
    error: { code: 'internal_error', message: 'Internal error (ref corr-1)', data: { correlationId: 'corr-1' } },
  })
})

it('round-trips internal_error through parseCommandResult unchanged, since it is stored and replayed', () => {
  const result = internalErrorResult('cmd-1', 'corr-1')
  // mirrors a ledger read: the result was serialised to storage and back
  expect(parseCommandResult(JSON.parse(JSON.stringify(result)))).toStrictEqual(result)
})

it('round-trips register approval rejections with their typed data', () => {
  const required = { sessionId: 's', thresholdMinor: 500, variance: { cash: -600, external: 0 } } satisfies RegisterApprovalRequiredData
  const invalid = { reason: 'variance_mismatch' } satisfies RegisterApprovalInvalidData
  const results = [
    { id: 'cmd-1', status: 'rejected', error: { code: 'register_approval_required' satisfies CommandRejectionCode, message: 'approval required', data: { ...required } } },
    { id: 'cmd-2', status: 'rejected', error: { code: 'register_approval_invalid' satisfies RegisterConflictCode, message: 'approval invalid', data: { ...invalid } } },
  ] satisfies CommandResult[]
  for (const result of results) {
    expect(parseCommandResult(JSON.parse(JSON.stringify(result)))).toStrictEqual(result)
  }
})
