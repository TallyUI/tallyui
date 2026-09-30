import { BehaviorSubject, type Observable } from 'rxjs';
import type { OutboxState, TransportOutcome } from './types';

// Consecutive 404 answers before backendMissing tells the cashier; fewer may be a deploy blip.
const NOT_FOUND_BEFORE_NOTICE = 3;

/** Counts consecutive 404s across every outbox given it, so a missing plugin shows once, whichever outbox meets it. */
export interface BackendNotFound {
  /** A 404 counts; any other answer from the store clears; offline (`network`) changes nothing. */
  record(outcome: TransportOutcome, at: number): void;
  backendMissing$: Observable<OutboxState['backendMissing']>;
}

export function createBackendNotFound(): BackendNotFound {
  let count = 0;
  let since = 0; // when the first of the consecutive 404s arrived
  const backendMissing$ = new BehaviorSubject<OutboxState['backendMissing']>(undefined);
  return {
    backendMissing$,
    record(outcome, at) {
      if (outcome.kind === 'retry' && outcome.reason === 'network') return;
      if (outcome.kind === 'retry' && outcome.reason === 'status_404') { if (count++ === 0) since = at; } else count = 0;
      const missing = count >= NOT_FOUND_BEFORE_NOTICE;
      if (missing !== !!backendMissing$.value) backendMissing$.next(missing ? { since } : undefined);
    },
  };
}
