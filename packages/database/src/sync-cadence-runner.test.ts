import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject, Subject } from 'rxjs';
import type { UpdateRequired } from '@tallyui/core';

import { createConnectivityTracker, type ConnectivityTracker } from './connectivity';
import type { SyncCadence } from './sync-cadence';
import { jitteredIntervalMs, startSyncCadence, type SyncCadenceRunner } from './sync-cadence-runner';

const balanced: SyncCadence = { checkIntervalMs: 60_000, pullBatchSize: 50 };
const till: UpdateRequired = { reason: 'till_update_required', fixedBy: 'till', status: 426 };
const target = (paused?: boolean) => ({ reSync: vi.fn(), ...(paused === undefined ? {} : { isPaused: vi.fn(() => paused) }) });

describe('startSyncCadence', () => {
  let runner: SyncCadenceRunner | undefined;
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    runner?.stop();
    runner = undefined;
    vi.useRealTimers();
  });

  const start = (options: { cadence$?: Subject<SyncCadence>; targets?: ReturnType<typeof target>[]; random?: () => number; connectivity?: ConnectivityTracker } = {}) => {
    const cadence$ = options.cadence$ ?? new BehaviorSubject(balanced);
    const targets = options.targets ?? [target()];
    runner = startSyncCadence({ targets, cadence$, connectivity: options.connectivity, random: options.random ?? (() => 0.5), now: () => Date.now() });
    let due: number | undefined;
    runner.nextDueAtMs$.subscribe((value) => { due = value; });
    return { cadence$, targets, runner, due: () => due };
  };

  it('runs no timer before the first cadence value', () => {
    const { targets, due } = start({ cadence$: new Subject() });
    vi.advanceTimersByTime(600_000);
    expect(targets[0].reSync).not.toHaveBeenCalled();
    expect(due()).toBeUndefined();
  });

  it('ticks every target once a period and moves the due time on', () => {
    const t0 = Date.now();
    const { targets, due } = start({ targets: [target(), target()] });
    expect(due()).toBe(t0 + 60_000);
    vi.advanceTimersByTime(59_999);
    expect(targets[0].reSync).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    for (const t of targets) expect(t.reSync).toHaveBeenCalledTimes(1);
    expect(due()).toBe(t0 + 120_000);
    vi.advanceTimersByTime(60_000);
    for (const t of targets) expect(t.reSync).toHaveBeenCalledTimes(2);
  });

  it("jitters by v2's ±20 %", () => {
    expect(jitteredIntervalMs(60_000, () => 0)).toBe(48_000);
    expect(jitteredIntervalMs(60_000, () => 0.5)).toBe(60_000);
    expect(jitteredIntervalMs(60_000, () => 0.999_999)).toBe(72_000);
    const { targets } = start({ random: () => 0 });
    vi.advanceTimersByTime(47_999);
    expect(targets[0].reSync).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(targets[0].reSync).toHaveBeenCalledTimes(1);
  });

  it('re-arms from now on a new cadence value', () => {
    const { cadence$, targets } = start();
    vi.advanceTimersByTime(30_000);
    cadence$.next({ checkIntervalMs: 10_000, pullBatchSize: 50 });
    vi.advanceTimersByTime(9_999);
    expect(targets[0].reSync).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(targets[0].reSync).toHaveBeenCalledTimes(1);
  });

  it('ignores a repeated equal value', () => {
    const { cadence$, targets } = start();
    vi.advanceTimersByTime(30_000);
    cadence$.next({ checkIntervalMs: 60_000, pullBatchSize: 50 });
    vi.advanceTimersByTime(29_999);
    expect(targets[0].reSync).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(targets[0].reSync).toHaveBeenCalledTimes(1);
  });

  it('skips a paused target and calls the others', () => {
    const { targets } = start({ targets: [target(true), target(false), target()] });
    vi.advanceTimersByTime(60_000);
    expect(targets.map((t) => t.reSync.mock.calls.length)).toEqual([0, 1, 1]);
  });

  it('skips a tick while update-required is latched, and still re-arms', () => {
    const connectivity = createConnectivityTracker({ connector: { classifyFailure: () => ({ updateRequired: till }) } });
    connectivity.recordFailure(new Error('gate'));
    expect(connectivity.current().updateRequired).toEqual(till);
    const { targets, due } = start({ connectivity });
    const t0 = Date.now();
    vi.advanceTimersByTime(60_000);
    expect(targets[0].reSync).not.toHaveBeenCalled();
    expect(due()).toBe(t0 + 120_000);
    connectivity.resetUpdateRequired();
    vi.advanceTimersByTime(60_000);
    expect(targets[0].reSync).toHaveBeenCalledTimes(1);
  });

  it('still ticks while offline', () => {
    const connectivity = createConnectivityTracker();
    connectivity.linkDown();
    expect(connectivity.current().state).toBe('offline');
    const { targets } = start({ connectivity });
    vi.advanceTimersByTime(60_000);
    expect(targets[0].reSync).toHaveBeenCalledTimes(1);
  });

  it('tickNow ticks at once and re-arms from now', () => {
    const { targets, runner: r } = start();
    vi.advanceTimersByTime(20_000);
    r.tickNow();
    expect(targets[0].reSync).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(40_000);
    expect(targets[0].reSync).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20_000);
    expect(targets[0].reSync).toHaveBeenCalledTimes(2);
  });

  it('stop ends the timer, the due stream and every later call', () => {
    const { cadence$, targets, runner: r } = start();
    const seen: (number | undefined)[] = [];
    let completed = false;
    r.nextDueAtMs$.subscribe({ next: (value) => seen.push(value), complete: () => { completed = true; } });
    r.stop();
    expect(cadence$.observed).toBe(false);
    expect(seen.at(-1)).toBeUndefined();
    expect(completed).toBe(true);
    vi.advanceTimersByTime(600_000);
    r.tickNow();
    expect(() => r.stop()).not.toThrow();
    cadence$.next({ checkIntervalMs: 10_000, pullBatchSize: 50 });
    vi.advanceTimersByTime(600_000);
    expect(targets[0].reSync).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a throwing target stops neither the others nor the timer', () => {
    const failing = target();
    failing.reSync.mockImplementation(() => { throw new Error('boom'); });
    const { targets } = start({ targets: [failing, target()] });
    vi.advanceTimersByTime(60_000);
    expect(targets[1].reSync).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(targets[0].reSync).toHaveBeenCalledTimes(2);
    expect(targets[1].reSync).toHaveBeenCalledTimes(2);
  });
});
