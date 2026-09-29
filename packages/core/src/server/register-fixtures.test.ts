// @vitest-environment node
import { expect, it } from 'vitest'
import type {
  RegisterClosureSubmitPayload, RegisterCommandEnvelope, RegisterMovementRecordPayload, RegisterMovementVoidPayload,
  RegisterSessionOpenPayload, RegisterSessionTransitionPayload,
} from '../types'
import { registerPayloadErrors } from './register-payload-shape'

// packages/pos has no register command fixtures, so these are one full envelope per register command type,
// typed by the payload interfaces core exports, with their optional fields set.
const sessionId = '01926f3a-7c00-7000-8000-000000000001'
const registerId = 'register_01JC2Y8Q4Z'
const envelope = <P>(type: RegisterCommandEnvelope['type'], id: string, payload: P): RegisterCommandEnvelope<P> => ({
  id, type, version: 1, payload, createdAt: '2026-09-11T17:00:00.000Z', deviceId: 'device_1', attempt: 1,
})

const envelopes = [
  envelope('register.session.open', '01926f3a-7c00-7000-8000-000000000011', {
    sessionId, registerId, storeKey: '1', businessDay: '2026-09-11', openedAt: '2026-09-11T08:00:00.000Z',
    openedBy: '1', expectedFloatMinor: 10000, countedFloatMinor: 9950, openingVarianceMinor: -50,
  } satisfies RegisterSessionOpenPayload),
  envelope('register.movement.record', '01926f3a-7c00-7000-8000-000000000012', {
    movementId: '01926f3a-7c00-7000-8000-000000000021', sessionId, type: 'paid_out', amountMinor: 1250,
    reason: 'Milk for the coffee machine', createdAt: '2026-09-11T10:15:00.000Z', createdBy: '1',
  } satisfies RegisterMovementRecordPayload),
  envelope('register.movement.record', '01926f3a-7c00-7000-8000-000000000013', {
    movementId: '01926f3a-7c00-7000-8000-000000000022', sessionId, type: 'no_sale', amountMinor: 0,
    reason: 'Change for a customer', createdAt: '2026-09-11T11:00:00.000Z',
  } satisfies RegisterMovementRecordPayload),
  envelope('register.movement.void', '01926f3a-7c00-7000-8000-000000000014', {
    movementId: '01926f3a-7c00-7000-8000-000000000023', sessionId, voids: '01926f3a-7c00-7000-8000-000000000021',
    createdAt: '2026-09-11T10:20:00.000Z', createdBy: '1',
  } satisfies RegisterMovementVoidPayload),
  envelope('register.session.transition', '01926f3a-7c00-7000-8000-000000000015', {
    sessionId, status: 'counting', at: '2026-09-11T16:45:00.000Z',
  } satisfies RegisterSessionTransitionPayload),
  envelope('register.session.transition', '01926f3a-7c00-7000-8000-000000000016', {
    sessionId, status: 'closed', at: '2026-09-11T17:00:00.000Z', counted: { cash: 17800, card: 12000 },
    closedBy: '1', approvedBy: '2',
  } satisfies RegisterSessionTransitionPayload),
  envelope('register.closure.submit', '01926f3a-7c00-7000-8000-000000000017', {
    closureId: '01926f3a-7c00-7000-8000-000000000031', sessionId, registerId, number: 42, businessDay: '2026-09-11',
    openedAt: '2026-09-11T08:00:00.000Z', closedAt: '2026-09-11T17:00:00.000Z', closedBy: '1', approvedBy: '2',
    tillExpected: { cash: 18000, card: 12000 }, counted: { cash: 17800, card: 12000 },
    periodSalesTotalMinor: 25000, periodRefundsTotalMinor: 5000,
    perpetualSalesTotalMinor: 525000, perpetualRefundsTotalMinor: 25000,
    unsyncedCount: 2, unsyncedTotalMinor: 1200, softwareVersion: 'preview',
    orderIds: ['01926f3a-7c00-7000-8000-000000000041'], movementIds: ['01926f3a-7c00-7000-8000-000000000021'],
  } satisfies RegisterClosureSubmitPayload),
]

it('covers every register command type', () => {
  expect(new Set(envelopes.map(command => command.type))).toEqual(new Set([
    'register.session.open', 'register.session.transition', 'register.movement.record',
    'register.movement.void', 'register.closure.submit',
  ]))
})

it.each(envelopes.map(command => [command.type, command] as const))('accepts envelope %# (%s)', (type, command) => {
  expect(registerPayloadErrors(type, command.payload)).toEqual([])
})
