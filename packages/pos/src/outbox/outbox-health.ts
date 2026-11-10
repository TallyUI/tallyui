import { combineLatest, distinctUntilChanged, map, type Observable } from 'rxjs';
import type { OutboxState } from './types';

export interface OutboxCounts {
  /** `OutboxState.pending`. */
  pending: number;
  /** `OutboxState.rejected`, 0 when unset. */
  rejected: number;
  /** `OutboxState.stuck.commandIds.length`, 0 when unset. These rows are pending too. */
  stuck: number;
}
export interface OutboxHealth {
  /** The order outbox (`useOrderOutbox`): sales. */
  sales: OutboxCounts;
  /** The register outbox (`useRegisterOutbox`): till updates. */
  tillUpdates: OutboxCounts;
  /** Rejected plus stuck rows across both outboxes. Not `needsAttention()`'s list, which also holds applied orders with warnings. */
  attention: number;
  /** Either outbox parked after repeated 401s (`OutboxState.authRequired`): the cashier signs in again, then both flush. */
  authRequired: boolean;
}
/** The health of both outboxes from their states. Pure. */
export function summarizeOutboxHealth(sales: OutboxState, tillUpdates: OutboxState): OutboxHealth {
  const salesCounts = { pending: sales.pending, rejected: sales.rejected ?? 0, stuck: sales.stuck?.commandIds.length ?? 0 };
  const tillCounts = { pending: tillUpdates.pending, rejected: tillUpdates.rejected ?? 0, stuck: tillUpdates.stuck?.commandIds.length ?? 0 };
  return { sales: salesCounts, tillUpdates: tillCounts,
    attention: salesCounts.rejected + salesCounts.stuck + tillCounts.rejected + tillCounts.stuck,
    authRequired: !!(sales.authRequired || tillUpdates.authRequired) };
}

/** summarizeOutboxHealth over both state streams (combineLatest), emitting only when a field changes. */
export function watchOutboxHealth(sales$: Observable<OutboxState>, tillUpdates$: Observable<OutboxState>): Observable<OutboxHealth> {
  return combineLatest([sales$, tillUpdates$]).pipe(
    map(([sales, tillUpdates]) => summarizeOutboxHealth(sales, tillUpdates)),
    distinctUntilChanged((a, b) => a.sales.pending === b.sales.pending && a.sales.rejected === b.sales.rejected &&
      a.sales.stuck === b.sales.stuck && a.tillUpdates.pending === b.tillUpdates.pending &&
      a.tillUpdates.rejected === b.tillUpdates.rejected && a.tillUpdates.stuck === b.tillUpdates.stuck &&
      a.attention === b.attention && a.authRequired === b.authRequired),
  );
}
