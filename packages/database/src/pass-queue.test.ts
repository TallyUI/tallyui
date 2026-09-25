import { describe, it, expect, vi } from 'vitest';

import { createPassQueue } from './pass-queue';

/** A promise plus its own resolve/reject, for controlling a fake pass from outside. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('createPassQueue', () => {
  it('idle starts a pass', async () => {
    const run = vi.fn(async () => 'result');
    const trigger = createPassQueue(run);

    await expect(trigger()).resolves.toBe('result');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('3 triggers mid-pass give exactly 1 follow-up, and later triggers share it', async () => {
    const gates = [deferred<string>(), deferred<string>()];
    let call = 0;
    const run = vi.fn(() => gates[call++].promise);
    const trigger = createPassQueue(run);

    const first = trigger();
    const a = trigger();
    const b = trigger();
    const c = trigger();
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(run).toHaveBeenCalledTimes(1); // no follow-up starts while the current pass is still in flight

    gates[0].resolve('first');
    await expect(first).resolves.toBe('first');
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2)); // exactly one follow-up

    gates[1].resolve('follow-up');
    await expect(a).resolves.toBe('follow-up');
  });

  it('a follow-up starts only after the current pass settles, including when that pass rejects', async () => {
    const gates = [deferred<string>(), deferred<string>()];
    let call = 0;
    const run = vi.fn(() => gates[call++].promise);
    const trigger = createPassQueue(run);

    const first = trigger();
    const followUp = trigger();
    expect(run).toHaveBeenCalledTimes(1); // the follow-up has not started yet

    gates[0].reject(new Error('boom'));
    await expect(first).rejects.toThrow('boom');
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2)); // the rejection is not shared with the follow-up

    gates[1].resolve('recovered');
    await expect(followUp).resolves.toBe('recovered');
  });

  it('a trigger during the follow-up queues another, each resolving to its own pass', async () => {
    const gates = [deferred<string>(), deferred<string>(), deferred<string>()];
    let call = 0;
    const run = vi.fn(() => gates[call++].promise);
    const trigger = createPassQueue(run);

    const first = trigger();
    const followUp = trigger();
    gates[0].resolve('a');
    await expect(first).resolves.toBe('a');
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2)); // the follow-up is now running

    const next = trigger();
    expect(next).not.toBe(followUp);

    gates[1].resolve('b');
    await expect(followUp).resolves.toBe('b');
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(3));

    gates[2].resolve('c');
    await expect(next).resolves.toBe('c');
  });
});
