// Ported from WCPOS `next` `3b5331b5c` `audit.test.ts` (ADR-032 amendment 1) — only the tests
// that exercise `recordRegisterFact`'s kept, non-outbox/bridge kinds. `getLogger` mocking becomes
// a capturing sink on `registerFactsLogger`, the pattern `../logging/sinks.test.ts` uses.
//
// Moved to job c, with the outbox/bridge facts themselves (see `facts.ts`'s header):
// - "preserves the legacy merchant-facing helper rows"
// - "retains capped outbox identity and untitled bridge diagnostics"
// - "preserves outbox classification $endpoint / $code / $persist / $retry" (it.each) — every
//   case exercises `outbox-request-failed`, which a2 has no outbox to attach to.
// The spec's own count ("6 of 8, 2 moved") undercounts: the source file has 10 `it` declarations,
// not 8, and a third is moved for the reason above, leaving 7 kept, not 6.
import { beforeEach, expect, it } from 'vitest';
import { recordRegisterFact, registerFactsLogger, type RegisterFact } from './facts';
import type { LogEntry } from '../logging';

const entries: LogEntry[] = [];
registerFactsLogger.addSink({ id: 'capture', levels: ['debug', 'info', 'warn', 'error'], write: (e) => entries.push(e) });
beforeEach(() => {
  entries.length = 0;
});
const actor = { id: '7', name: 'Pat' };
const input = { actor, sessionId: 's', registerId: 'r' };
// Attempt-shaped rows carry a fresh operationId so the logger's repeat collapse keeps each attempt.
const attempt = expect.stringMatching(/^[0-9a-f]{32}$/);
const last = () => entries[entries.length - 1];

it('logs approval granted with the requesting cashier and approver id', () => {
  recordRegisterFact({ kind: 'approval-granted', ...input, approvedBy: '8' });
  expect(last()).toMatchObject({
    level: 'info',
    message: 'Register session approval granted',
    data: {
      actor,
      terminal: { operationId: attempt },
      context: { type: 'register.approval-granted', sessionId: 's', registerId: 'r', approvedBy: '8' },
    },
  });
});

it('logs approval refused with the requesting cashier', () => {
  recordRegisterFact({ kind: 'approval-refused', ...input });
  expect(last()).toMatchObject({
    level: 'warn',
    message: 'Register session approval refused',
    data: { actor, terminal: { operationId: attempt }, context: { type: 'register.approval-refused', sessionId: 's', registerId: 'r' } },
  });
});

it('logs the variance and threshold with the cashier', () => {
  recordRegisterFact({ kind: 'variance-over-threshold', ...input, variance: 1000, threshold: 500 });
  expect(last()).toMatchObject({
    level: 'warn',
    message: 'Register count exceeds variance threshold',
    data: {
      actor,
      terminal: { operationId: attempt },
      context: { type: 'register.variance-over-threshold', sessionId: 's', registerId: 'r', variance: 1000, threshold: 500 },
    },
  });
});

it('logs X-report dispatch with the cashier', () => {
  recordRegisterFact({ kind: 'x-report-dispatched', ...input });
  expect(last()).toMatchObject({
    level: 'info',
    message: 'Register X-report print dispatched',
    data: { actor, terminal: { operationId: attempt }, context: { type: 'register.x-report-printed', sessionId: 's', registerId: 'r' } },
  });
});

it('logs drawer dispatch with the cashier', () => {
  recordRegisterFact({ kind: 'drawer-dispatched', ...input });
  expect(last()).toMatchObject({
    level: 'info',
    message: 'Register drawer kick dispatched',
    data: { actor, terminal: { operationId: attempt }, context: { type: 'register.drawer-opened', sessionId: 's', registerId: 'r' } },
  });
});

it('gives every attempt its own operationId so repeat collapsing cannot fold two attempts', () => {
  recordRegisterFact({ kind: 'variance-over-threshold', actor, sessionId: 's', registerId: 'r', variance: -1750, threshold: 500 });
  recordRegisterFact({ kind: 'variance-over-threshold', actor, sessionId: 's', registerId: 'r', variance: -200, threshold: 500 });
  const ids = entries.map((e) => (e.data?.terminal as { operationId?: string } | undefined)?.operationId);
  expect(ids).toHaveLength(2);
  for (const id of ids) expect(id).toMatch(/^[0-9a-f]{32}$/);
  expect(ids[0]).not.toBe(ids[1]);
});

// TallyUI-only (#134 review): a Z report's own number, not just its counted/variance figures.
it('logs the closure number with a session-closed fact', () => {
  recordRegisterFact({ kind: 'session-closed', ...input, closureId: 'c', number: 7, counted: { cash: 100 }, variance: { cash: 0 } });
  expect(last()).toMatchObject({ data: { context: { type: 'register.session-closed', closureId: 'c', number: 7 } } });
});

// Removing a mapping, attributing a system fact, or changing its fold policy breaks this table.
const pair = { sessionId: 'session-id', registerId: 'register-id' };
const human = { ...pair, actor };
const movement = { ...pair, movementId: 'movement-id', movementType: 'paid_in' as const, amount: 2000 };
const cases: { fact: RegisterFact; type: string; identity: string }[] = [
  { fact: { kind: 'session-opened', ...human, amount: 10000, variance: null }, type: 'register.session-opened', identity: 'sessionid' },
  { fact: { kind: 'counting-started', ...human }, type: 'register.counting-started', identity: 'fresh' },
  { fact: { kind: 'counting-abandoned', ...human }, type: 'register.counting-abandoned', identity: 'fresh' },
  {
    fact: { kind: 'session-closed', ...human, closureId: 'closure-id', number: 42, counted: { cash: 10000 }, variance: { cash: 0 } },
    type: 'register.session-closed',
    identity: 'closureid',
  },
  { fact: { kind: 'movement-recorded', ...movement, actor }, type: 'register.movement-recorded', identity: 'movementid' },
  {
    fact: { kind: 'movement-recorded', ...movement, actor, movementType: 'no_sale' },
    type: 'register.no-sale-recorded',
    identity: 'movementid',
  },
  {
    fact: { kind: 'movement-voided', ...movement, actor, voids: 'original' },
    type: 'register.movement-voided',
    identity: 'movementid',
  },
  { fact: { kind: 'approval-granted', ...human, approvedBy: '8' }, type: 'register.approval-granted', identity: 'fresh' },
  { fact: { kind: 'approval-refused', ...human }, type: 'register.approval-refused', identity: 'fresh' },
  {
    fact: { kind: 'variance-over-threshold', ...human, variance: -1000, threshold: 500 },
    type: 'register.variance-over-threshold',
    identity: 'fresh',
  },
  { fact: { kind: 'x-report-dispatched', ...human }, type: 'register.x-report-printed', identity: 'fresh' },
  { fact: { kind: 'drawer-dispatched', ...human }, type: 'register.drawer-opened', identity: 'fresh' },
];
it.each(cases)('$fact.kind maps its type, actor, searchable pair and identity', ({ fact, type, identity }) => {
  recordRegisterFact(fact);
  recordRegisterFact(fact);
  expect(entries).toHaveLength(2);
  const [first, second] = entries.map((e) => e.data!);
  expect(first.context).toMatchObject({ type, sessionId: 'session-id', registerId: 'register-id' });
  expect(first.actor).toEqual(actor);
  if (identity === 'fresh') {
    expect((first.terminal as { operationId?: string }).operationId).toMatch(/^[0-9a-f]{32}$/);
    expect((first.terminal as { operationId?: string }).operationId).not.toBe(
      (second.terminal as { operationId?: string }).operationId,
    );
  } else {
    expect((first.terminal as { operationId?: string }).operationId).toBe(identity);
    expect((second.terminal as { operationId?: string }).operationId).toBe(identity);
  }
});
