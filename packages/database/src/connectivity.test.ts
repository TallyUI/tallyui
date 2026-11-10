import { describe, expect, it } from 'vitest';
import type { FailureClass, UpdateRequired } from '@tallyui/core';

import {
  createConnectivityTracker, reduceConnectivity, INITIAL_CONNECTIVITY, type ConnectivityEvent, type ConnectivitySnapshot,
} from './connectivity';

const run = (events: ConnectivityEvent[], from: ConnectivitySnapshot = INITIAL_CONNECTIVITY) => events.reduce(reduceConnectivity, from);
const fail = (at: number, failure: FailureClass = 'offline'): ConnectivityEvent => ({ type: 'failure', at, failure });
const till: UpdateRequired = { reason: 'till_update_required', fixedBy: 'till', status: 426 };
const store: UpdateRequired = { reason: 'unsupported_store', fixedBy: 'store', minVersion: '1.9.0' };

describe('reduceConnectivity', () => {
  it('goes online to offline after 30 s of failures, and back online on one success', () => {
    const offline = run([fail(1_000), fail(31_000)]);
    expect(offline).toEqual({ state: 'offline', updateRequired: null, failingSince: 1_000 });
    expect(run([{ type: 'success', at: 32_000 }], offline)).toEqual(INITIAL_CONNECTIVITY);
  });

  it('leaves the state alone inside the confirmation window', () => {
    expect(run([fail(0), fail(10_000), fail(20_000)]).state).toBe('online');
  });

  it('is degraded from 29 s of failure (the window less its tolerance), not before', () => {
    expect(run([fail(0, 'degraded'), fail(28_999, 'degraded')]).state).toBe('online');
    expect(run([fail(0, 'degraded'), fail(29_000, 'degraded')]).state).toBe('degraded');
  });

  it('takes the latest failure class once confirmed', () => {
    expect(run([fail(0, 'degraded'), fail(30_000, 'degraded'), fail(31_000, 'offline')]).state).toBe('offline');
  });

  it('starts a new window after a success', () => {
    expect(run([fail(0), { type: 'success', at: 20_000 }, fail(25_000), fail(40_000)]).state).toBe('online');
  });

  it('latches update-required, holds it across successes, keeps the first, and clears only on reset', () => {
    const latched = run([fail(0, { updateRequired: till }), { type: 'success', at: 1 }, fail(2, { updateRequired: store })]);
    expect(latched).toEqual({ state: 'online', updateRequired: till, failingSince: null });
    expect(run([{ type: 'reset-update-required' }], latched).updateRequired).toBeNull();
  });

  it('treats the refusal as an answer: it ends a failure run', () => {
    expect(run([fail(0), fail(10_000, { updateRequired: till }), fail(30_000)]).state).toBe('online');
  });

  it('is offline at once when the link drops', () => {
    expect(run([fail(0), { type: 'link-down' }])).toEqual({ state: 'offline', updateRequired: null, failingSince: null });
  });

  it('re-anchors the window when the clock goes back', () => {
    expect(run([fail(100_000), fail(50_000), fail(70_000)])).toMatchObject({ state: 'online', failingSince: 50_000 });
  });

  it('returns the same object when nothing changes', () => {
    const offline = run([fail(0), fail(30_000)]);
    expect(reduceConnectivity(offline, fail(40_000, null))).toBe(offline);
    expect(reduceConnectivity(offline, fail(50_000))).toBe(offline);
    expect(reduceConnectivity(INITIAL_CONNECTIVITY, { type: 'success', at: 1 })).toBe(INITIAL_CONNECTIVITY);
    expect(reduceConnectivity(INITIAL_CONNECTIVITY, { type: 'reset-update-required' })).toBe(INITIAL_CONNECTIVITY);
  });
});

describe('createConnectivityTracker', () => {
  it('emits only on change and classifies with its connector', () => {
    let at = 0;
    const tracker = createConnectivityTracker({
      now: () => at,
      connector: { classifyFailure: (error) => ((error as { code?: string }).code === 'gate' ? { updateRequired: till } : 'degraded') },
    });
    const seen: ConnectivitySnapshot[] = [];
    tracker.snapshot$.subscribe((snapshot) => seen.push(snapshot));
    tracker.recordSuccess();
    expect(tracker.recordFailure(new Error('x'))).toBe('degraded');
    at = 30_000;
    tracker.recordFailure(new Error('x'));
    expect(tracker.current().state).toBe('degraded');
    expect(tracker.recordFailure({ code: 'gate' })).toEqual({ updateRequired: till });
    tracker.resetUpdateRequired();
    expect(seen.map((s) => [s.state, s.updateRequired?.reason ?? null])).toEqual([
      ['online', null], ['online', null], ['degraded', null], ['online', 'till_update_required'], ['online', null],
    ]);
  });

  it('uses the neutral rule without a connector', () => {
    const tracker = createConnectivityTracker({ now: () => 0 });
    expect(tracker.recordFailure(new TypeError('Failed to fetch'))).toBe('offline');
    tracker.linkDown();
    expect(tracker.current().state).toBe('offline');
  });
});
