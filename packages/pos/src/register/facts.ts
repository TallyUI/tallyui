/**
 * Register facts (ADR-032): a closed vocabulary of human register actions, logged through
 * TallyUI's own logger. Port provenance (ADR-032 amendment 1): WCPOS `next` `3b5331b5c`
 * `audit.ts`, `RegisterFact` and `recordRegisterFact` only — `useRegisterActor` is React and
 * belongs to job c, and so do the outbox/bridge-diagnostic facts (`outbox-approval-refused`,
 * `outbox-request-failed`, `movement-retry-requested`, `movement-accepted`, `session-adopted`,
 * `session-pruned`, `binding-changed`, `binding-removed`, `directory-unavailable`,
 * `bridge-cycle-failed`): a2 has no outbox or hardware-bridge concept yet to attach them to.
 *
 * Neutral changes from the WCPOS source: WCPOS's `mintUuid` (`register-document.ts`) becomes
 * a2's own; a person id (`approvedBy`) is a2's string id, not WCPOS's numeric one; money fields
 * are a2's integer minor units, matching `CashMovement.amountMinor` and `Closure.counted`/
 * `variance`.
 *
 * TallyUI's own addition (registers c1a): `late-sale`, a sale whose money was taken but whose
 * session refused the stamp (ADR-032 amendment "Late sale"). Its `sessionId` is the session it
 * tried, and its durable subject is the order.
 */
import { createLogger } from '../logging';
import { mintUuid } from './register-document';
import type { CashMovement, Closure, RegisterSession } from './schemas';

/** The register-session logging scope; the app attaches its own sinks (console, remote, toast). */
export const registerFactsLogger = createLogger('register-session');

const attempt = () => ({ operationId: mintUuid().replace(/-/g, '') });

export type Actor = { id: string; name: string };
type Pair = { sessionId: string | undefined; registerId: string | null | undefined };
type Human = Pair & { actor: Actor };
type Movement = Pair & { movementId: string; movementType: CashMovement['type']; amount: number };

type SimpleKind = 'counting-started' | 'counting-abandoned' | 'approval-refused' | 'x-report-dispatched' | 'drawer-dispatched';
export type RegisterFact =
  | (Human & { kind: 'session-opened'; amount: number; variance: RegisterSession['opening_variance_minor'] })
  | (Human & { kind: SimpleKind })
  | (Human & { kind: 'session-closed'; closureId: string } & Pick<Closure, 'number' | 'counted' | 'variance'>)
  | (Human & Movement & { kind: 'movement-recorded' })
  | (Human & Movement & { kind: 'movement-voided'; voids: string })
  | (Human & { kind: 'approval-granted'; approvedBy: string | null })
  | (Human & { kind: 'variance-over-threshold'; variance: number; threshold: number | undefined })
  | (Pair & { kind: 'late-sale'; orderId: string; actor?: Actor });

/** A human action without its own durable record gets a fresh attempt id; a durable action (a
 * session, a movement or a late sale's order) uses the stable id of its subject. */
function identity(fact: RegisterFact): { operationId: string } {
  switch (fact.kind) {
    case 'session-opened':
      return { operationId: fact.sessionId?.replace(/-/g, '') ?? '' };
    case 'session-closed':
      return { operationId: fact.closureId.replace(/-/g, '') };
    case 'movement-recorded':
    case 'movement-voided':
      return { operationId: fact.movementId.replace(/-/g, '') };
    case 'late-sale':
      return { operationId: fact.orderId.replace(/-/g, '') };
    default:
      return attempt();
  }
}

export function recordRegisterFact(fact: RegisterFact): void {
  const terminal = identity(fact);
  const pair = { sessionId: fact.sessionId, registerId: fact.registerId };
  const emit = (
    message: string,
    type: string,
    context: Record<string, unknown> = {},
    level: 'info' | 'warn' = 'info',
  ) => registerFactsLogger[level](message, { actor: fact.actor, terminal, context: { type, ...pair, ...context } });
  switch (fact.kind) {
    case 'session-opened':
      return emit('Register session opened', 'register.session-opened', { amount: fact.amount, variance: fact.variance });
    case 'counting-started':
      return emit('Register session counting started', 'register.counting-started');
    case 'counting-abandoned':
      return emit('Register session counting abandoned', 'register.counting-abandoned');
    case 'session-closed':
      return emit('Register session closed', 'register.session-closed', {
        closureId: fact.closureId, number: fact.number, counted: fact.counted, variance: fact.variance,
      });
    case 'movement-recorded':
      // No-sale is the cashier action, independent of drawer dispatch, and makes no cash claim.
      if (fact.movementType === 'no_sale')
        return emit('Register no-sale recorded', 'register.no-sale-recorded', { movementId: fact.movementId });
      return emit('Register cash movement recorded', 'register.movement-recorded', {
        movementId: fact.movementId, movementType: fact.movementType, amount: fact.amount,
      });
    case 'movement-voided':
      return emit('Register cash movement voided', 'register.movement-voided', {
        movementId: fact.movementId, movementType: fact.movementType, amount: fact.amount, voids: fact.voids,
      });
    case 'approval-granted':
      return emit('Register session approval granted', 'register.approval-granted', { approvedBy: fact.approvedBy });
    case 'approval-refused':
      return emit('Register session approval refused', 'register.approval-refused', {}, 'warn');
    case 'variance-over-threshold':
      return emit('Register count exceeds variance threshold', 'register.variance-over-threshold',
        { variance: fact.variance, threshold: fact.threshold }, 'warn');
    // These prove dispatch success, not that paper printed or a physical drawer opened.
    case 'x-report-dispatched':
      return emit('Register X-report print dispatched', 'register.x-report-printed');
    case 'drawer-dispatched':
      return emit('Register drawer kick dispatched', 'register.drawer-opened');
    // The money was taken, so the sale is kept and queued, outside every closure.
    case 'late-sale':
      return emit('Register late sale kept outside its session', 'register.late-sale', { orderId: fact.orderId }, 'warn');
  }
}
