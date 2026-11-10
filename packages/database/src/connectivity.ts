import { BehaviorSubject, type Observable } from 'rxjs';

import { classifyFailure, type ConnectivityState, type FailureClass, type TallyConnector, type UpdateRequired } from '@tallyui/core';

// The seam (ADR-084 decision 1): this tracker fills what WCPOS v2's `@wcpos/sync-engine` takes as its
// `RxdbSyncEnginePorts.connectivity` port and its transport's update-required latch (`engine-transport.ts`), so a
// later switch to those packages replaces this file, not its callers.

/**
 * How long requests must keep failing, with no success, before the verdict leaves `online`: v2's
 * `WEBSITE_UNAVAILABLE_CONFIRMATION_MS` (`packages/hooks/src/website-unavailable-confirmation.ts`). One 502 or one
 * timeout must not tell the cashier the store is down (WCPOS #1669).
 */
export const FAILURE_CONFIRMATION_MS = 30_000;
/** v2's `WEBSITE_UNAVAILABLE_CONFIRMATION_TOLERANCE_MS`: a retry one window later may land a little early. */
export const FAILURE_CONFIRMATION_TOLERANCE_MS = 1_000;

/** `failingSince` is when the current run of failures started, `null` once the store last answered. */
export interface ConnectivitySnapshot {
  state: ConnectivityState;
  updateRequired: UpdateRequired | null;
  failingSince: number | null;
}

export type ConnectivityEvent =
  | { type: 'success'; at: number }
  | { type: 'failure'; at: number; failure: FailureClass }
  /** The OS says the link is down: offline at once, as v2. */
  | { type: 'link-down' }
  | { type: 'reset-update-required' };

export const INITIAL_CONNECTIVITY: ConnectivitySnapshot = { state: 'online', updateRequired: null, failingSince: null };

const answered = (snapshot: ConnectivitySnapshot): ConnectivitySnapshot =>
  snapshot.state === 'online' && snapshot.failingSince === null ? snapshot : { ...snapshot, state: 'online', failingSince: null };

/**
 * v2's rule (`use-online-status.web.tsx`): the first success is online; a failure changes the verdict only once
 * failures have run for the confirmation window. The latch holds across successes, first sight wins, and only a
 * reset (v2: a fresh engine) clears it. Returns the same object when nothing changes.
 */
export function reduceConnectivity(snapshot: ConnectivitySnapshot, event: ConnectivityEvent): ConnectivitySnapshot {
  switch (event.type) {
    case 'success':
      return answered(snapshot);
    case 'link-down':
      return snapshot.state === 'offline' && snapshot.failingSince === null ? snapshot : { ...snapshot, state: 'offline', failingSince: null };
    case 'reset-update-required':
      return snapshot.updateRequired === null ? snapshot : { ...snapshot, updateRequired: null };
    case 'failure': {
      const { failure, at } = event;
      if (failure === null) return snapshot;
      if (typeof failure === 'object') {
        // The store answered with its refusal, so it is reachable.
        const next = answered(snapshot);
        return next.updateRequired ? next : { ...next, updateRequired: failure.updateRequired };
      }
      // A clock that went back would hold the verdict off for ever: re-anchor instead.
      const failingSince = snapshot.failingSince === null || snapshot.failingSince > at ? at : snapshot.failingSince;
      const confirmed = at - failingSince >= FAILURE_CONFIRMATION_MS - FAILURE_CONFIRMATION_TOLERANCE_MS;
      const state = confirmed ? failure : snapshot.state;
      return state === snapshot.state && failingSince === snapshot.failingSince ? snapshot : { ...snapshot, state, failingSince };
    }
  }
}

export interface ConnectivityTracker {
  /** The current snapshot on subscribe, then each change. */
  readonly snapshot$: Observable<ConnectivitySnapshot>;
  current(): ConnectivitySnapshot;
  recordSuccess(): void;
  /** Classifies with the tracker's connector, reduces, and returns the class. */
  recordFailure(error: unknown): FailureClass;
  linkDown(): void;
  /** Clears the update-required latch, for a re-probe after the store or the till was updated. */
  resetUpdateRequired(): void;
}

/** One tracker per connector session; a new one starts clear, as a fresh v2 engine does. */
export function createConnectivityTracker(
  options: { connector?: Pick<TallyConnector, 'classifyFailure'>; now?: () => number } = {},
): ConnectivityTracker {
  const { connector, now = Date.now } = options;
  const subject = new BehaviorSubject<ConnectivitySnapshot>(INITIAL_CONNECTIVITY);
  const dispatch = (event: ConnectivityEvent) => {
    const next = reduceConnectivity(subject.getValue(), event);
    if (next !== subject.getValue()) subject.next(next);
  };
  return {
    snapshot$: subject.asObservable(),
    current: () => subject.getValue(),
    recordSuccess: () => dispatch({ type: 'success', at: now() }),
    recordFailure: (error) => {
      const failure = classifyFailure(connector, error);
      dispatch({ type: 'failure', at: now(), failure });
      return failure;
    },
    linkDown: () => dispatch({ type: 'link-down' }),
    resetUpdateRequired: () => dispatch({ type: 'reset-update-required' }),
  };
}
