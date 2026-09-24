import { BehaviorSubject, type Observable } from 'rxjs';

/**
 * ADR-061: exactly one live tab per store, and a second tab never opens
 * storage. `acquiring` while a hand-over is in flight, `live` while this tab
 * holds the lock, `parked` after handing over, `blocked` when the live tab
 * never answered and the user must close it.
 */
export type LiveTabState = 'acquiring' | 'live' | 'parked' | 'blocked';

type LiveTabChannel = Pick<BroadcastChannel, 'postMessage' | 'close'> & {
  onmessage: ((event: { data: unknown }) => void) | null;
};

interface HandoverMessage {
  type: 'handover-request' | 'handover-ack';
  id: string;
}

function isHandoverMessage(data: unknown): data is HandoverMessage {
  const msg = data as Partial<HandoverMessage> | null;
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg.type === 'handover-request' || msg.type === 'handover-ack') &&
    typeof msg.id === 'string'
  );
}

export interface LiveTabOptions {
  /** Store scope; the lock and channel are named `tally-live-tab:<scope>`. */
  scope: string;
  /** Called on the live tab before it hands over: close the database, stop workers. Awaited. */
  onPark: () => void | Promise<void>;
  /** True while a sale, payment or storage write is in flight; the hand-over waits for false. */
  isBusy?: () => boolean;
  /** Longest the live tab defers a hand-over while busy (default 10_000 ms). */
  maxDeferMs?: number;
  /** How long a new tab waits for the live tab to acknowledge (default 3_000 ms). */
  ackTimeoutMs?: number;
  /** Injection for tests and non-browser hosts; default globalThis.navigator?.locks and globalThis.BroadcastChannel. */
  locks?: Pick<LockManager, 'request'>;
  createChannel?: (name: string) => LiveTabChannel;
  /** Injection for tests; default globalThis. Source of `pagehide`/`pageshow`. */
  events?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  /** Injection for tests; default Date.now. Wall clock for the busy-defer cap below. */
  now?: () => number;
}

export interface LiveTabHandle {
  state$: Observable<LiveTabState>;
  /** Ask the live tab to hand over, and take the lock. Used on start and by the parked screen's "Use here" button. */
  takeOver(): Promise<LiveTabState>;
  /** Release the lock and close the channel (sign-out, unmount). */
  stop(): void;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Coordinates one live tab per store (ADR-061) over a Web Lock and a
 * BroadcastChannel, both named `tally-live-tab:<scope>`.
 *
 * On platforms without Web Locks (React Native, Node, tests: `locks` is
 * undefined) a tab is simply live at once, since native and Electron have
 * one window per store.
 */
export function startLiveTab(options: LiveTabOptions): LiveTabHandle {
  const {
    scope,
    onPark,
    isBusy,
    maxDeferMs = 10_000,
    ackTimeoutMs = 3_000,
    locks = globalThis.navigator?.locks,
    createChannel = (name) => new BroadcastChannel(name) as unknown as LiveTabChannel,
    events = globalThis,
    now = Date.now,
  } = options;
  const state = new BehaviorSubject<LiveTabState>('acquiring');

  if (!locks) {
    state.next('live');
    return { state$: state.asObservable(), takeOver: () => Promise.resolve('live'), stop: () => state.complete() };
  }

  const name = `tally-live-tab:${scope}`;
  let channel = createChannel(name);
  let releaseLock: (() => void) | undefined;
  let parking = false;
  let requestCounter = 0;
  let stopped = false;
  let deferBlockedTimer: ReturnType<typeof setTimeout> | undefined;
  // Aborts every locks.request() in flight; resume() swaps in a fresh one for the next round.
  let abortController = new AbortController();
  // Unique per coordinator instance, so two tabs requesting at once never mint the same id
  // (a shared id would let one ack satisfy both waiters).
  const tabToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const ackWaiters = new Map<string, () => void>();

  /** Holds the lock (if granted) until `releaseLock()` resolves the held promise. */
  // `controller` defaults to the one current when called, so a late grant for a round before a resume is told apart from the current round.
  const requestLock = (lockOptions: Omit<LockOptions, 'signal'>, controller = abortController): Promise<boolean> =>
    new Promise<boolean>((resolve, reject) => {
      // Browsers reject `signal` with `ifAvailable` (NotSupportedError), so the probe carries none; a late probe grant is still caught below by `stopped`/the stale-controller check.
      locks
        .request(name, lockOptions.ifAvailable ? lockOptions : { ...lockOptions, signal: controller.signal }, (lock) => {
          // Stopped, or a stale grant from before a suspend/resume: hand the lock straight back (a non-promise return releases it at once) and never go live.
          if (!lock || stopped || controller !== abortController) {
            resolve(false);
            return undefined;
          }
          resolve(true);
          return new Promise<void>((release) => {
            releaseLock = release;
          });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) resolve(false);
          else reject(error);
        });
    });

  const waitForAck = (id: string): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        ackWaiters.delete(id);
        resolve(false);
      }, ackTimeoutMs);
      ackWaiters.set(id, () => {
        clearTimeout(timer);
        ackWaiters.delete(id);
        resolve(true);
      });
    });

  const handleHandoverRequest = async (id: string) => {
    if (state.value !== 'live' || parking) return;
    parking = true;
    channel.postMessage({ type: 'handover-ack', id });
    try {
      // Wall clock, not a count of sleeps: this tab is in the background right now, and
      // browsers throttle background timers to ~1 s or more, so each sleep(100) can take
      // far longer than requested and a sleep count would blow well past maxDeferMs.
      const start = now();
      while (isBusy?.() && now() - start < maxDeferMs) await sleep(100);
      try {
        await onPark();
      } catch (error) {
        // Reload is the recovery, so a broken onPark still parks and frees the lock.
        console.warn(`live-tab: onPark failed for scope "${scope}"; parking anyway.`, error);
      }
    } finally {
      releaseLock?.();
      releaseLock = undefined;
      parking = false;
      state.next('parked');
    }
  };

  const handleChannelMessage = (event: { data: unknown }) => {
    if (!isHandoverMessage(event.data)) return;
    if (event.data.type === 'handover-ack') ackWaiters.get(event.data.id)?.();
    else void handleHandoverRequest(event.data.id);
  };
  channel.onmessage = handleChannelMessage;

  // Shared by overlapping takeOver() calls, so a double tap doesn't race two
  // hand-over requests against each other (like runners sharing a relay pass).
  let inFlightTakeOver: Promise<LiveTabState> | undefined;

  const performTakeOver = async (): Promise<LiveTabState> => {
    state.next('acquiring');
    if (await requestLock({ ifAvailable: true })) {
      state.next('live');
      return 'live';
    }
    if (stopped) return state.value;

    const id = `${tabToken}-${++requestCounter}`;
    // Register the waiter before posting: an ack can arrive synchronously.
    const acked = waitForAck(id);
    channel.postMessage({ type: 'handover-request', id });
    // Queue for the lock at once, racing the ack: the live tab may already be closing
    // (StrictMode's stop-then-restart, a closing page), so a lock that frees within
    // milliseconds is taken straight away instead of waiting out ackTimeoutMs.
    // No deadline on the request itself: only stop() gives up waiting.
    const gotLockPromise = requestLock({});
    const lockFirst = await Promise.race([gotLockPromise.then(() => true), acked.then(() => false)]);

    if (lockFirst) {
      ackWaiters.delete(id);
    } else if (await acked) {
      // Acked: shown as blocked once the old defer+ack deadline passes, but keeps waiting.
      deferBlockedTimer = setTimeout(() => state.next('blocked'), maxDeferMs + ackTimeoutMs);
    } else {
      state.next('blocked');
    }
    if (stopped) return state.value;

    const gotLock = await gotLockPromise;
    clearTimeout(deferBlockedTimer);
    deferBlockedTimer = undefined;
    if (stopped) return state.value;
    state.next(gotLock ? 'live' : 'blocked');
    return gotLock ? 'live' : 'blocked';
  };

  const takeOver = (): Promise<LiveTabState> => {
    // Stopped: nothing left to ask for or hold.
    if (stopped) return Promise.resolve(state.value);
    // Already holding the lock: nothing to ask for, and trying again would
    // fail ifAvailable against our own held lock and post a request nobody answers.
    if (state.value === 'live') return Promise.resolve('live');
    if (!inFlightTakeOver) {
      inFlightTakeOver = performTakeOver().finally(() => {
        inFlightTakeOver = undefined;
      });
    }
    return inFlightTakeOver;
  };

  // pagehide: release the lock and park, but never complete state$ or touch the listeners.
  const suspend = () => {
    stopped = true;
    abortController.abort();
    releaseLock?.();
    releaseLock = undefined;
    ackWaiters.clear();
    clearTimeout(deferBlockedTimer);
    deferBlockedTimer = undefined;
    channel.onmessage = null;
    channel.close();
    state.next('parked');
  };

  // bfcache restore: fresh controller and channel for a clean round, then re-acquire.
  const resume = () => {
    abortController = new AbortController();
    channel = createChannel(name);
    channel.onmessage = handleChannelMessage;
    stopped = false;
    void takeOver().catch((error) => {
      console.warn(`live-tab: takeOver failed for scope "${scope}".`, error);
      state.next('blocked');
    });
  };

  const handlePageShow = (event: Event) => {
    if ((event as PageTransitionEvent).persisted && stopped) resume();
  };

  const handlePageHide = () => {
    suspend();
    // Best-effort, not awaited (pagehide can't wait): frees the OPFS handles for another
    // tab while this page sits in the bfcache; reload is still the recovery if it fails.
    void Promise.resolve().then(onPark).catch((error: unknown) => {
      console.warn(`live-tab: onPark failed for scope "${scope}" on pagehide.`, error);
    });
  };

  const stop = () => {
    suspend();
    events.removeEventListener?.('pagehide', handlePageHide);
    events.removeEventListener?.('pageshow', handlePageShow);
    state.complete();
  };

  // A reload or a closing page never sends an ack; pageshow recovers after a bfcache restore.
  events.addEventListener?.('pagehide', handlePageHide);
  events.addEventListener?.('pageshow', handlePageShow);

  // Start. A rejection here (a real locks.request() error, not an abort) still resolves a state.
  void takeOver().catch((error) => {
    console.warn(`live-tab: takeOver failed for scope "${scope}".`, error);
    state.next('blocked');
  });

  return { state$: state.asObservable(), takeOver, stop };
}
