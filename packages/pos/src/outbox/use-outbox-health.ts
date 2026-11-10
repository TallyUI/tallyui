import { useMemo } from 'react';
import { summarizeOutboxHealth, type OutboxHealth } from './outbox-health';
import type { UseOrderOutboxResult } from './use-order-outbox';
import type { UseRegisterOutboxResult } from './use-register-outbox';

export interface UseOutboxHealthOptions {
  /** `useOrderOutbox()`'s result; only `state` and `flush` are read. */
  sales: Pick<UseOrderOutboxResult, 'state' | 'flush'>;
  /** `useRegisterOutbox()`'s result; only `state` and `flush` are read. */
  tillUpdates: Pick<UseRegisterOutboxResult, 'state' | 'flush'>;
}
export interface UseOutboxHealthResult {
  /** summarizeOutboxHealth of the two states; a new object only when a state changes. */
  health: OutboxHealth;
  /** Flushes both outboxes at once (after the cashier signs in again); rejects if either flush rejects. */
  flush(): Promise<void>;
}
export function useOutboxHealth(options: UseOutboxHealthOptions): UseOutboxHealthResult {
  const { sales, tillUpdates } = options;
  const health = useMemo(() => summarizeOutboxHealth(sales.state, tillUpdates.state), [sales.state, tillUpdates.state]);
  return { health, async flush() { await Promise.all([sales.flush(), tillUpdates.flush()]); } };
}
