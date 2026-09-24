import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { startLiveTab, type LiveTabHandle, type LiveTabState } from './live-tab';

/**
 * In-memory Web Lock, one name at a time. Supports `ifAvailable` (resolves
 * with `null` at once when taken) and `signal` (queues, rejects AbortError
 * if the signal aborts first).
 */
function createFakeLockManager(): Pick<LockManager, 'request'> {
  let held = false;
  let waiters: Array<() => void> = [];

  const request = (name: string, lockOptions: LockOptions, callback: (lock: Lock | null) => unknown): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      const grant = () => {
        held = true;
        Promise.resolve(callback({} as Lock)).then(
          (result) => {
            held = false;
            waiters.shift()?.();
            resolve(result);
          },
          (error) => {
            held = false;
            waiters.shift()?.();
            reject(error);
          },
        );
      };

      if (!held) {
        grant();
        return;
      }
      if (lockOptions.ifAvailable) {
        resolve(callback(null));
        return;
      }

      const waiter = () => {
        lockOptions.signal?.removeEventListener('abort', onAbort);
        grant();
      };
      const onAbort = () => {
        waiters = waiters.filter((w) => w !== waiter);
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      };
      waiters.push(waiter);
      lockOptions.signal?.addEventListener('abort', onAbort);
    });
  };

  return { request } as unknown as Pick<LockManager, 'request'>;
}

/** Connects fake BroadcastChannels of the same name; a channel never receives its own posts. */
function createChannelHub() {
  type FakeChannel = { onmessage: ((event: { data: unknown }) => void) | null; postMessage: (data: unknown) => void; close: () => void };
  const groups = new Map<string, Set<FakeChannel>>();

  const createChannel = (name: string): FakeChannel => {
    const peers = groups.get(name) ?? new Set<FakeChannel>();
    groups.set(name, peers);
    const self: FakeChannel = {
      onmessage: null,
      postMessage: (data) => {
        for (const peer of peers) if (peer !== self) peer.onmessage?.({ data });
      },
      close: () => peers.delete(self),
    };
    peers.add(self);
    return self;
  };

  /** A channel connected to nothing: posts vanish, nothing is ever received. */
  const createDroppedChannel = (): FakeChannel => ({ onmessage: null, postMessage: () => {}, close: () => {} });

  return { createChannel, createDroppedChannel };
}

const currentState = (handle: LiveTabHandle): LiveTabState => {
  let value!: LiveTabState;
  handle.state$.subscribe((v) => { value = v; }).unsubscribe();
  return value;
};

describe('startLiveTab', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('a lone tab becomes live', async () => {
    const locks = createFakeLockManager();
    const hub = createChannelHub();
    const a = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel: hub.createChannel });
    await vi.advanceTimersByTimeAsync(0);
    expect(currentState(a)).toBe('live');
    a.stop();
  });

  it('is live at once with no Web Locks, and takeOver() does nothing else', async () => {
    const createChannel = vi.fn();
    const a = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks: undefined, createChannel });
    expect(currentState(a)).toBe('live');
    await expect(a.takeOver()).resolves.toBe('live');
    expect(createChannel).not.toHaveBeenCalled();
  });

  it('hands over: A parks, B becomes live, and neither is live at once', async () => {
    const locks = createFakeLockManager();
    const hub = createChannelHub();
    const onParkA = vi.fn();
    const a = startLiveTab({ scope: 'store-1', onPark: onParkA, locks, createChannel: hub.createChannel });
    await vi.advanceTimersByTimeAsync(0);
    expect(currentState(a)).toBe('live');

    const states: LiveTabState[] = [];
    a.state$.subscribe((s) => states.push(s));
    const b = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel: hub.createChannel });
    await vi.advanceTimersByTimeAsync(0);

    expect(onParkA).toHaveBeenCalledTimes(1);
    expect(currentState(a)).toBe('parked');
    expect(currentState(b)).toBe('live');
    expect(states.filter((s) => s === 'live').length).toBe(1);
    a.stop();
    b.stop();
  });

  it('defers the hand-over while busy, and parks once busy turns false', async () => {
    const locks = createFakeLockManager();
    const hub = createChannelHub();
    const onParkA = vi.fn();
    let busy = true;
    const a = startLiveTab({ scope: 'store-1', onPark: onParkA, isBusy: () => busy, locks, createChannel: hub.createChannel });
    await vi.advanceTimersByTimeAsync(0);

    const b = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel: hub.createChannel });
    await vi.advanceTimersByTimeAsync(1_900);
    expect(onParkA).not.toHaveBeenCalled();
    expect(currentState(a)).toBe('live');

    busy = false;
    await vi.advanceTimersByTimeAsync(200);
    expect(onParkA).toHaveBeenCalledTimes(1);
    expect(currentState(a)).toBe('parked');
    expect(currentState(b)).toBe('live');
    a.stop();
    b.stop();
  });

  it('parks after maxDeferMs even while still busy', async () => {
    const locks = createFakeLockManager();
    const hub = createChannelHub();
    const onParkA = vi.fn();
    const a = startLiveTab({ scope: 'store-1', onPark: onParkA, isBusy: () => true, maxDeferMs: 500, locks, createChannel: hub.createChannel });
    await vi.advanceTimersByTimeAsync(0);

    const b = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel: hub.createChannel });
    await vi.advanceTimersByTimeAsync(500);

    expect(onParkA).toHaveBeenCalledTimes(1);
    expect(currentState(a)).toBe('parked');
    expect(currentState(b)).toBe('live');
    a.stop();
    b.stop();
  });

  it('blocks a new tab when nothing acknowledges the handover', async () => {
    const locks = createFakeLockManager();
    const hub = createChannelHub();
    // A holds the lock but its channel is dropped, so it never acks.
    const a = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel: hub.createDroppedChannel });
    await vi.advanceTimersByTimeAsync(0);
    expect(currentState(a)).toBe('live');

    const b = startLiveTab({ scope: 'store-1', onPark: vi.fn(), ackTimeoutMs: 3_000, locks, createChannel: hub.createChannel });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(currentState(b)).toBe('blocked');
    a.stop();
    b.stop();
  });

  it('"Use here": a parked tab takes over again, and the other parks in turn', async () => {
    const locks = createFakeLockManager();
    const hub = createChannelHub();
    const a = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel: hub.createChannel });
    await vi.advanceTimersByTimeAsync(0);
    const b = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel: hub.createChannel });
    await vi.advanceTimersByTimeAsync(0);
    expect(currentState(a)).toBe('parked');
    expect(currentState(b)).toBe('live');

    const result = a.takeOver();
    await vi.advanceTimersByTimeAsync(0);
    expect(currentState(b)).toBe('parked');
    expect(currentState(a)).toBe('live');
    await expect(result).resolves.toBe('live');
    a.stop();
    b.stop();
  });

  it('takeOver() on a live tab is a no-op: it returns live, keeps the lock, and posts nothing', async () => {
    const locks = createFakeLockManager();
    const hub = createChannelHub();
    let postCount = 0;
    const createChannel = (name: string) => {
      const channel = hub.createChannel(name);
      const originalPostMessage = channel.postMessage.bind(channel);
      channel.postMessage = (data: unknown) => {
        postCount += 1;
        originalPostMessage(data);
      };
      return channel;
    };
    const a = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel });
    await vi.advanceTimersByTimeAsync(0);
    expect(currentState(a)).toBe('live');

    await expect(a.takeOver()).resolves.toBe('live');
    expect(currentState(a)).toBe('live');
    expect(postCount).toBe(0);
    a.stop();
  });

  it('two rapid takeOver() calls from a parked tab lead to exactly one hand-over', async () => {
    const locks = createFakeLockManager();
    const hub = createChannelHub();
    const a = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel: hub.createChannel });
    await vi.advanceTimersByTimeAsync(0);
    const onParkB = vi.fn();
    const b = startLiveTab({ scope: 'store-1', onPark: onParkB, locks, createChannel: hub.createChannel });
    await vi.advanceTimersByTimeAsync(0);
    expect(currentState(a)).toBe('parked');
    expect(currentState(b)).toBe('live');

    const aStates: LiveTabState[] = [];
    a.state$.subscribe((s) => aStates.push(s));

    // A double tap on "Use here": two overlapping takeOver() calls, neither awaited first.
    const first = a.takeOver();
    const second = a.takeOver();
    await vi.advanceTimersByTimeAsync(0);

    expect(onParkB).toHaveBeenCalledTimes(1);
    expect(currentState(b)).toBe('parked');
    expect(currentState(a)).toBe('live');
    await expect(first).resolves.toBe('live');
    await expect(second).resolves.toBe('live');
    expect(aStates.filter((s) => s === 'live').length).toBe(1);
    a.stop();
    b.stop();
  });

  it('still parks and warns when onPark throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const locks = createFakeLockManager();
    const hub = createChannelHub();
    const a = startLiveTab({ scope: 'store-1', onPark: () => { throw new Error('boom'); }, locks, createChannel: hub.createChannel });
    await vi.advanceTimersByTimeAsync(0);
    const b = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel: hub.createChannel });
    await vi.advanceTimersByTimeAsync(0);

    expect(currentState(a)).toBe('parked');
    expect(currentState(b)).toBe('live');
    expect(warn).toHaveBeenCalled();
    a.stop();
    b.stop();
  });

  it('gives B and C distinct request ids, so A acks only the first and the other ends blocked', async () => {
    const locks = createFakeLockManager();
    const hub = createChannelHub();
    const a = startLiveTab({ scope: 'store-1', onPark: () => new Promise(() => {}), locks, createChannel: hub.createChannel });
    await vi.advanceTimersByTimeAsync(0);
    expect(currentState(a)).toBe('live');

    // B and C both request while A is live and about to start parking.
    const b = startLiveTab({ scope: 'store-1', onPark: vi.fn(), ackTimeoutMs: 3_000, locks, createChannel: hub.createChannel });
    const c = startLiveTab({ scope: 'store-1', onPark: vi.fn(), ackTimeoutMs: 3_000, locks, createChannel: hub.createChannel });
    await vi.advanceTimersByTimeAsync(0);

    // A is parking (stuck in onPark) but hasn't released the lock yet, so it still reads 'live'.
    expect(currentState(a)).toBe('live');
    expect(currentState(b)).not.toBe('live');
    expect(currentState(c)).not.toBe('live');

    await vi.advanceTimersByTimeAsync(3_000);

    // Exactly one of B/C got the ack and is now queued for the lock (not blocked); the other
    // never saw an ack for its own id and is blocked. Neither ever reached 'live' while the
    // other held (or was queued for) the lock.
    const states = [currentState(b), currentState(c)];
    expect(states.filter((s) => s === 'blocked').length).toBe(1);
    expect(states).not.toContain('live');
    a.stop();
    b.stop();
    c.stop();
  });

  it('stop() releases the lock, even with onPark stuck, and a waiting tab becomes live', async () => {
    const locks = createFakeLockManager();
    const hub = createChannelHub();
    const a = startLiveTab({ scope: 'store-1', onPark: () => new Promise(() => {}), locks, createChannel: hub.createChannel });
    await vi.advanceTimersByTimeAsync(0);
    expect(currentState(a)).toBe('live');

    const b = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel: hub.createChannel });
    await vi.advanceTimersByTimeAsync(0);
    // A acked and is stuck waiting on its own onPark; B is queued for the lock.
    expect(currentState(b)).toBe('acquiring');

    a.stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(currentState(b)).toBe('live');
    b.stop();
  });
});
