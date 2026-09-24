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
    // Real browsers reject this combination outright (NotSupportedError).
    if (lockOptions.ifAvailable && lockOptions.signal) {
      return Promise.reject(new DOMException("'signal' and 'ifAvailable' options cannot be used together", 'NotSupportedError'));
    }
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

/**
 * Same lock semantics as `createFakeLockManager`, but every answer arrives in
 * a later task (`setTimeout(…, delay)`), like a real browser. An `ifAvailable`
 * probe honours an already-aborted signal; a request already queued for the
 * lock is delivered whenever its turn comes regardless of a later abort —
 * real Web Locks can race the same way, which is exactly why the coordinator
 * also guards its own grant callback with `stopped` instead of trusting the
 * signal alone.
 */
function createAsyncFakeLockManager(delay = 10): Pick<LockManager, 'request'> {
  let held = false;
  type Entry = { callback: (lock: Lock | null) => unknown; resolve: (v: unknown) => void; reject: (e: unknown) => void };
  const waiters: Entry[] = [];

  const deliver = (entry: Entry) => {
    held = true;
    setTimeout(() => {
      Promise.resolve(entry.callback({} as Lock)).then(
        (result) => {
          held = false;
          entry.resolve(result);
          const next = waiters.shift();
          if (next) deliver(next);
        },
        (error) => {
          held = false;
          entry.reject(error);
          const next = waiters.shift();
          if (next) deliver(next);
        },
      );
    }, delay);
  };

  const request = (_name: string, lockOptions: LockOptions, callback: (lock: Lock | null) => unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      // Real browsers reject this combination outright (NotSupportedError).
      if (lockOptions.ifAvailable && lockOptions.signal) {
        reject(new DOMException("'signal' and 'ifAvailable' options cannot be used together", 'NotSupportedError'));
        return;
      }
      const entry: Entry = { callback, resolve, reject };
      if (lockOptions.ifAvailable) {
        setTimeout(() => {
          if (lockOptions.signal?.aborted) reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          else if (held) resolve(callback(null));
          else deliver(entry);
        }, delay);
        return;
      }
      if (!held) deliver(entry);
      else waiters.push(entry);
    });

  return { request } as unknown as Pick<LockManager, 'request'>;
}

/** Connects fake BroadcastChannels of the same name, delivering each message in a later task. */
function createAsyncChannelHub(delay = 10) {
  type FakeChannel = { onmessage: ((event: { data: unknown }) => void) | null; postMessage: (data: unknown) => void; close: () => void };
  const groups = new Map<string, Set<FakeChannel>>();

  const createChannel = (name: string): FakeChannel => {
    const peers = groups.get(name) ?? new Set<FakeChannel>();
    groups.set(name, peers);
    const self: FakeChannel = {
      onmessage: null,
      postMessage: (data) => {
        for (const peer of peers) if (peer !== self) setTimeout(() => peer.onmessage?.({ data }), delay);
      },
      close: () => peers.delete(self),
    };
    peers.add(self);
    return self;
  };

  const createDroppedChannel = (): FakeChannel => ({ onmessage: null, postMessage: () => {}, close: () => {} });

  return { createChannel, createDroppedChannel };
}

/** A fake `globalThis`-shaped event target for `pagehide`/`pageshow`, with a `dispatch` helper. */
function createFakeEvents() {
  type Listener = (event: { type: string; persisted?: boolean }) => void;
  const listeners = new Map<string, Set<Listener>>();
  const addEventListener = (type: string, listener: Listener) => {
    (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(listener);
  };
  const removeEventListener = (type: string, listener: Listener) => {
    listeners.get(type)?.delete(listener);
  };
  const dispatch = (type: string, persisted?: boolean) => {
    for (const listener of listeners.get(type) ?? []) listener({ type, persisted });
  };
  return { addEventListener, removeEventListener, dispatch } as unknown as Pick<
    EventTarget,
    'addEventListener' | 'removeEventListener'
  > & { dispatch: (type: string, persisted?: boolean) => void };
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

  it('B: the ifAvailable probe carries no signal, so a lone tab still goes live and the hand-over still works with the fake enforcing the rule', async () => {
    const locks = createAsyncFakeLockManager();
    const hub = createAsyncChannelHub();
    const onParkA = vi.fn();
    const a = startLiveTab({ scope: 'store-1', onPark: onParkA, locks, createChannel: hub.createChannel });
    await vi.advanceTimersByTimeAsync(50);
    expect(currentState(a)).toBe('live');

    const b = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel: hub.createChannel });
    await vi.advanceTimersByTimeAsync(50);
    expect(onParkA).toHaveBeenCalledTimes(1);
    expect(currentState(a)).toBe('parked');
    expect(currentState(b)).toBe('live');
    a.stop();
    b.stop();
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

  it('D: stop() emits a final parked before completing state$', async () => {
    const locks = createFakeLockManager();
    const hub = createChannelHub();
    const a = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel: hub.createChannel });
    await vi.advanceTimersByTimeAsync(0);
    expect(currentState(a)).toBe('live');

    const states: LiveTabState[] = [];
    let completed = false;
    a.state$.subscribe({ next: (s) => states.push(s), complete: () => { completed = true; } });
    a.stop();
    expect(completed).toBe(true);
    expect(states[states.length - 1]).toBe('parked');
  });

  // The sync fake above grants locks and delivers channel messages in the same tick,
  // which hides races that only show up when a grant or a message lands in a later
  // task, as it does in a real browser. These tests use the async fake for that.
  describe('with the async fake (real-browser timing)', () => {
    it('StrictMode: stopping before the grant lands lets the next start become live, and nothing is ever blocked', async () => {
      const locks = createAsyncFakeLockManager();
      const hub = createAsyncChannelHub();
      const a = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel: hub.createChannel });
      a.stop(); // stopped before its own ifAvailable grant is delivered
      const a2 = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel: hub.createChannel });
      const a2States: LiveTabState[] = [];
      a2.state$.subscribe((s) => a2States.push(s));
      // Amendment E: a2 queues for the lock at once, in parallel with its (never-answered,
      // since a's channel is already closed) ack. a's stale probe still wins the race first
      // and is released at once by the stopped check, but a2's own queued request then wins
      // the freed lock well within ackTimeoutMs, never sitting through it.
      await vi.advanceTimersByTimeAsync(100);
      expect(currentState(a2)).toBe('live');
      expect(a2States).not.toContain('blocked');
      a2.stop();
    });

    it('B stops while queued for the lock after being acked; its late grant releases at once and C becomes live', async () => {
      const locks = createAsyncFakeLockManager();
      const hub = createAsyncChannelHub();
      let releaseOnPark: (() => void) | undefined;
      const onParkA = vi.fn(() => new Promise<void>((resolve) => { releaseOnPark = resolve; }));
      const a = startLiveTab({ scope: 'store-1', onPark: onParkA, locks, createChannel: hub.createChannel });
      await vi.advanceTimersByTimeAsync(100);
      expect(currentState(a)).toBe('live');

      const b = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel: hub.createChannel });
      await vi.advanceTimersByTimeAsync(100);
      // B was acked and is now waiting for the lock, with no deadline.
      expect(currentState(b)).toBe('acquiring');
      b.stop();

      const c = startLiveTab({ scope: 'store-1', onPark: vi.fn(), ackTimeoutMs: 3_000, locks, createChannel: hub.createChannel });
      await vi.advanceTimersByTimeAsync(3_100);
      // A is still parking (stuck in onPark), so nothing ever acks C.
      expect(currentState(c)).toBe('blocked');

      releaseOnPark?.();
      await vi.advanceTimersByTimeAsync(200);

      expect(currentState(a)).toBe('parked');
      expect(currentState(c)).toBe('live');
      a.stop();
      c.stop();
    });

    it('the live tab closes before it can ack: the new tab goes live as soon as the lock frees, without ever showing blocked', async () => {
      const locks = createAsyncFakeLockManager();
      const hub = createAsyncChannelHub();
      // A's channel is dropped, modeling a page that closes before it can ack.
      const a = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel: hub.createDroppedChannel });
      await vi.advanceTimersByTimeAsync(50);
      expect(currentState(a)).toBe('live');

      const b = startLiveTab({ scope: 'store-1', onPark: vi.fn(), ackTimeoutMs: 3_000, locks, createChannel: hub.createChannel });
      const bStates: LiveTabState[] = [];
      b.state$.subscribe((s) => bStates.push(s));

      // A closes well inside the 3 s ack timeout; B was already queued for the lock in
      // parallel with its (never-arriving) ack, so it wins the lock instead of waiting.
      await vi.advanceTimersByTimeAsync(500);
      a.stop();
      await vi.advanceTimersByTimeAsync(50);
      expect(currentState(b)).toBe('live');
      expect(bStates).not.toContain('blocked');
      b.stop();
    });

    it('the old grant-wait deadline is gone: B stays queued through a 10 s defer plus a 4 s onPark and still ends live', async () => {
      const locks = createAsyncFakeLockManager();
      const hub = createAsyncChannelHub();
      let resolveOnPark: (() => void) | undefined;
      const onParkA = vi.fn(() => new Promise<void>((resolve) => { resolveOnPark = resolve; }));
      const a = startLiveTab({ scope: 'store-1', onPark: onParkA, isBusy: () => true, locks, createChannel: hub.createChannel });
      await vi.advanceTimersByTimeAsync(50);
      expect(currentState(a)).toBe('live');

      const b = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel: hub.createChannel });
      // A defers the full 10 s (still busy), then onPark runs 4 s more.
      await vi.advanceTimersByTimeAsync(10_100);
      expect(onParkA).toHaveBeenCalledTimes(1);
      expect(currentState(b)).toBe('acquiring');

      // Past maxDeferMs + ackTimeoutMs (13 s): B is now shown blocked, but the request
      // underneath keeps waiting (amendment C) rather than giving up.
      await vi.advanceTimersByTimeAsync(3_900);
      expect(currentState(b)).toBe('blocked');

      resolveOnPark?.();
      await vi.advanceTimersByTimeAsync(100);

      expect(currentState(a)).toBe('parked');
      expect(currentState(b)).toBe('live');
      a.stop();
      b.stop();
    });

    it('C: an acked tab shows blocked after maxDeferMs + ackTimeoutMs, but keeps waiting and can still go live', async () => {
      const locks = createAsyncFakeLockManager();
      const hub = createAsyncChannelHub();
      let releaseOnPark: (() => void) | undefined;
      const onParkA = vi.fn(() => new Promise<void>((resolve) => { releaseOnPark = resolve; }));
      const a = startLiveTab({ scope: 'store-1', onPark: onParkA, locks, createChannel: hub.createChannel });
      await vi.advanceTimersByTimeAsync(50);
      expect(currentState(a)).toBe('live');

      const b = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel: hub.createChannel });
      await vi.advanceTimersByTimeAsync(50);
      expect(currentState(b)).toBe('acquiring');

      await vi.advanceTimersByTimeAsync(13_000);
      expect(currentState(b)).toBe('blocked');

      releaseOnPark?.();
      await vi.advanceTimersByTimeAsync(100);
      expect(currentState(b)).toBe('live');
      a.stop();
      b.stop();
    });

    it('pagehide stops the live tab, freeing the lock for the next tab', async () => {
      // Every coordinator instance in this process shares one real `globalThis`,
      // so a second startLiveTab() running at pagehide time would stop too (it
      // registers its own listener); B is started only once A is confirmed gone.
      const locks = createAsyncFakeLockManager();
      const hub = createAsyncChannelHub();
      const a = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel: hub.createChannel });
      await vi.advanceTimersByTimeAsync(50);
      expect(currentState(a)).toBe('live');

      globalThis.dispatchEvent(new Event('pagehide'));
      await vi.advanceTimersByTimeAsync(50);

      const b = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel: hub.createChannel });
      await vi.advanceTimersByTimeAsync(50);
      expect(currentState(b)).toBe('live');
      a.stop();
      b.stop();
    });
  });

  describe('recovering after the back/forward cache', () => {
    it('A: pagehide fires onPark once, best-effort; a rejection does not stop the suspend and is warned', async () => {
      const locks = createAsyncFakeLockManager();
      const hub = createAsyncChannelHub();
      const events = createFakeEvents();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const onPark = vi.fn(() => Promise.reject(new Error('boom')));
      const a = startLiveTab({ scope: 'store-1', onPark, locks, createChannel: hub.createChannel, events });
      await vi.advanceTimersByTimeAsync(50);
      expect(currentState(a)).toBe('live');

      events.dispatch('pagehide');
      // suspend() is synchronous and never waits on onPark; onPark itself is only
      // scheduled (fire-and-forget), so it hasn't run until the microtask queue drains.
      expect(currentState(a)).toBe('parked');

      await vi.advanceTimersByTimeAsync(0);
      expect(onPark).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalled();
      a.stop();
    });

    it('round trip: pagehide parks without completing state$, pageshow re-acquires', async () => {
      const locks = createAsyncFakeLockManager();
      const hub = createAsyncChannelHub();
      const events = createFakeEvents();
      const a = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel: hub.createChannel, events });
      await vi.advanceTimersByTimeAsync(50);
      expect(currentState(a)).toBe('live');

      let completed = false;
      a.state$.subscribe({ complete: () => { completed = true; } });

      events.dispatch('pagehide');
      expect(currentState(a)).toBe('parked');
      expect(completed).toBe(false);

      events.dispatch('pageshow', true);
      expect(currentState(a)).toBe('acquiring');
      await vi.advanceTimersByTimeAsync(50);
      expect(currentState(a)).toBe('live');
      expect(completed).toBe(false);
      a.stop();
    });

    it('another tab takes over while A is suspended; on resume A asks, B hands over, A ends live', async () => {
      const locks = createAsyncFakeLockManager();
      const hub = createAsyncChannelHub();
      const events = createFakeEvents();
      const a = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel: hub.createChannel, events });
      await vi.advanceTimersByTimeAsync(50);
      expect(currentState(a)).toBe('live');

      events.dispatch('pagehide');
      expect(currentState(a)).toBe('parked');

      const onParkB = vi.fn();
      const b = startLiveTab({ scope: 'store-1', onPark: onParkB, locks, createChannel: hub.createChannel });
      await vi.advanceTimersByTimeAsync(50);
      expect(currentState(b)).toBe('live');

      events.dispatch('pageshow', true);
      await vi.advanceTimersByTimeAsync(100);

      expect(onParkB).toHaveBeenCalledTimes(1);
      expect(currentState(b)).toBe('parked');
      expect(currentState(a)).toBe('live');
      a.stop();
      b.stop();
    });

    it('a stale grant from before the suspend is released at once and never makes A live', async () => {
      const locks = createAsyncFakeLockManager();
      const hub = createAsyncChannelHub();
      const events = createFakeEvents();
      let releaseB: (() => void) | undefined;
      const onParkB = vi.fn(() => new Promise<void>((resolve) => { releaseB = resolve; }));
      const b = startLiveTab({ scope: 'store-1', onPark: onParkB, locks, createChannel: hub.createChannel });
      await vi.advanceTimersByTimeAsync(50);
      expect(currentState(b)).toBe('live');

      const a = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel: hub.createChannel, events });
      await vi.advanceTimersByTimeAsync(50);
      // Acked by B, now queued (no deadline) for the lock B still holds.
      expect(currentState(a)).toBe('acquiring');
      const aStates: LiveTabState[] = [];
      a.state$.subscribe((s) => aStates.push(s));

      events.dispatch('pagehide');
      expect(currentState(a)).toBe('parked');
      events.dispatch('pageshow', true);

      // B finally parks and frees the lock; the queued grant belongs to A's round before the suspend.
      releaseB?.();
      await vi.advanceTimersByTimeAsync(50);

      expect(aStates).not.toContain('live');
      a.stop();
      b.stop();

      // The stale grant released the lock at once rather than holding it: a fresh tab gets it straight away.
      const c = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel: hub.createChannel });
      await vi.advanceTimersByTimeAsync(50);
      expect(currentState(c)).toBe('live');
      c.stop();
    });

    it('after stop(), a bfcache pageshow does nothing and state$ stays complete', async () => {
      const locks = createAsyncFakeLockManager();
      const hub = createAsyncChannelHub();
      const events = createFakeEvents();
      const a = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel: hub.createChannel, events });
      await vi.advanceTimersByTimeAsync(50);
      expect(currentState(a)).toBe('live');

      const states: LiveTabState[] = [];
      let completed = false;
      a.state$.subscribe({ next: (s) => states.push(s), complete: () => { completed = true; } });
      a.stop();
      expect(completed).toBe(true);
      const emittedBeforePageshow = states.length;

      events.dispatch('pageshow', true);
      await vi.advanceTimersByTimeAsync(50);
      expect(states.length).toBe(emittedBeforePageshow);
      expect(completed).toBe(true);
    });

    it('pageshow with persisted false (a normal load) does nothing', async () => {
      const locks = createAsyncFakeLockManager();
      const hub = createAsyncChannelHub();
      const events = createFakeEvents();
      const a = startLiveTab({ scope: 'store-1', onPark: vi.fn(), locks, createChannel: hub.createChannel, events });
      await vi.advanceTimersByTimeAsync(50);
      expect(currentState(a)).toBe('live');

      events.dispatch('pagehide');
      expect(currentState(a)).toBe('parked');

      events.dispatch('pageshow', false);
      await vi.advanceTimersByTimeAsync(50);
      expect(currentState(a)).toBe('parked');
      a.stop();
    });
  });
});
