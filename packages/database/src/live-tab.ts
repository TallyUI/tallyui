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
  } = options;
  const state = new BehaviorSubject<LiveTabState>('acquiring');

  if (!locks) {
    state.next('live');
    return { state$: state.asObservable(), takeOver: () => Promise.resolve('live'), stop: () => state.complete() };
  }

  const name = `tally-live-tab:${scope}`;
  const channel = createChannel(name);
  let releaseLock: (() => void) | undefined;
  let parking = false;
  let requestCounter = 0;
  // Unique per coordinator instance, so two tabs requesting at once never mint the same id
  // (a shared id would let one ack satisfy both waiters).
  const tabToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const ackWaiters = new Map<string, () => void>();

  /** Holds the lock (if granted) until `releaseLock()` resolves the held promise. */
  const requestLock = (lockOptions: LockOptions): Promise<boolean> =>
    new Promise<boolean>((resolve, reject) => {
      locks
        .request(name, lockOptions, (lock) => {
          if (!lock) {
            resolve(false);
            return undefined;
          }
          resolve(true);
          return new Promise<void>((release) => {
            releaseLock = release;
          });
        })
        .catch((error: unknown) => {
          if (lockOptions.signal?.aborted) resolve(false);
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
      let waited = 0;
      while (isBusy?.() && waited < maxDeferMs) {
        await sleep(100);
        waited += 100;
      }
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

  channel.onmessage = (event) => {
    if (!isHandoverMessage(event.data)) return;
    if (event.data.type === 'handover-ack') ackWaiters.get(event.data.id)?.();
    else void handleHandoverRequest(event.data.id);
  };

  // Shared by overlapping takeOver() calls, so a double tap doesn't race two
  // hand-over requests against each other (like runners sharing a relay pass).
  let inFlightTakeOver: Promise<LiveTabState> | undefined;

  const performTakeOver = async (): Promise<LiveTabState> => {
    state.next('acquiring');
    if (await requestLock({ ifAvailable: true })) {
      state.next('live');
      return 'live';
    }

    const id = `${tabToken}-${++requestCounter}`;
    // Register the waiter before posting: an ack can arrive synchronously.
    const acked = waitForAck(id);
    channel.postMessage({ type: 'handover-request', id });
    if (!(await acked)) {
      state.next('blocked');
      return 'blocked';
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), maxDeferMs + ackTimeoutMs);
    const gotLock = await requestLock({ signal: controller.signal });
    clearTimeout(timer);
    state.next(gotLock ? 'live' : 'blocked');
    return gotLock ? 'live' : 'blocked';
  };

  const takeOver = (): Promise<LiveTabState> => {
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

  const stop = () => {
    releaseLock?.();
    releaseLock = undefined;
    channel.onmessage = null;
    channel.close();
    state.complete();
  };

  // Start. A rejection here (a real locks.request() error, not an abort) still resolves a state.
  void takeOver().catch((error) => {
    console.warn(`live-tab: takeOver failed for scope "${scope}".`, error);
    state.next('blocked');
  });

  return { state$: state.asObservable(), takeOver, stop };
}
