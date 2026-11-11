import {
  DisplaySignallingError, type DisplayAdvertisement, type DisplaySignalling, type DisplaySignallingContext, type SignalMessage,
} from '@tallyui/core';
import type { DisplayClock } from './display-link';
import { displayReducer, initialDisplayState, type DisplayState } from './display-state';
import { decode, makeEnvelope, type DisplayConfig, type DisplayEnvelope } from './protocol';
import { DISPLAY_TEMPLATE, HELLO_RETRY_MS } from './use-customer-display';
import { createDisplayPeerLink, type PeerFactory, type PeerLink, type PeerLinkState } from './webrtc';

/** TallyUI's choice: how often a waiting display asks whether the cashier has confirmed. */
export const COLLECT_POLL_MS = 2000;
/** TallyUI's choice: how often a paired display drains its inbox while no link is open. */
export const SIGNAL_POLL_MS = 1000;
/** TallyUI's choice: how often it drains its inbox while a link is open, so a re-linking till's offer is still seen. */
export const OPEN_SIGNAL_POLL_MS = 5000;
/** TallyUI's choice: how often it reads the snapshot fallback while no link is open. */
export const SNAPSHOT_POLL_MS = 2000;

/** Where the display keeps its token; U8 binds it to a local collection that is never replicated (ADR-085 d5). */
export interface DisplayTokenStore {
  load(): Promise<string | null>;
  save(token: string): Promise<void>;
  clear(): Promise<void>;
}
export type DisplayClientError = 'claim_refused' | 'collect_refused' | 'forgotten' | 'network' | 'server';
export type DisplayClientPhase =
  | { phase: 'starting' }
  | { phase: 'enter-code'; error?: DisplayClientError }
  | { phase: 'claiming' }
  | { phase: 'waiting'; checkCode: string }
  | { phase: 'paired'; link: PeerLinkState | 'none'; source: 'peer' | 'snapshot' | 'none'; online: boolean };
type Paired = Extract<DisplayClientPhase, { phase: 'paired' }>;
export interface DisplayClientOptions {
  signalling: DisplaySignalling;
  context: DisplaySignallingContext;
  tokens: DisplayTokenStore;
  /** The store's advertisement: its ICE servers for the peer, and whether to read snapshots. */
  advertisement: DisplayAdvertisement;
  createPeer?: PeerFactory;
  clock?: DisplayClock;
  onError?: (error: unknown) => void;
}
export interface DisplayClient {
  readonly phase: DisplayClientPhase;
  /** What the screen shows: the reducer's state, `initialDisplayState` until a config arrives. */
  readonly state: DisplayState;
  /** Called after any change to `phase` or `state`; returns the unsubscribe. */
  onChange(listener: () => void): () => void;
  /** Claims `code` as `displayName`, passing the current token if there is one (so a confirm moves this display). */
  claim(code: string, displayName: string): Promise<void>;
  /** Stops waiting for the confirm, and goes back to `enter-code` with no error. */
  cancel(): void;
  close(): void;
}

const systemClock: DisplayClock = {
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
const SNAPSHOT_EVENTS: readonly string[] = ['cart.updated', 'payment.state', 'display.idle'];
const codeOf = (error: unknown) => (error instanceof DisplaySignallingError ? error.code : undefined);

/** U4's snapshot body as two envelopes, or null when any part of it cannot be trusted (ADR-085 d8). */
function parseSnapshot(body: unknown): { seq: number; config: DisplayEnvelope; event: DisplayEnvelope } | null {
  if (typeof body !== 'object' || body === null) return null;
  const { v, seq, config, event } = body as Record<string, unknown>;
  if (v !== 1 || typeof seq !== 'number' || !Number.isFinite(seq)) return null;
  try {
    const configResult = decode(JSON.stringify(makeEnvelope('display.config', config as DisplayConfig, 'snapshot')));
    const eventResult = decode(JSON.stringify(event));
    if (!configResult.ok || configResult.envelope.action !== 'display.config') return null;
    if (!eventResult.ok || !SNAPSHOT_EVENTS.includes(eventResult.envelope.action)) return null;
    return { seq, config: configResult.envelope, event: eventResult.envelope };
  } catch {
    return null;
  }
}

/**
 * The second-device display's side (ADR-085 d4, d5, d8, d11; #705): pairs through the signalling seam, answers each
 * offer from its till with a peer link, says hello, and shows what the till sends, reading the snapshot fallback while
 * no link is open. A refused token clears the token and the screen, and goes back to the enter-code screen.
 */
export function createDisplayClient(options: DisplayClientOptions): DisplayClient {
  const { signalling, context, tokens, advertisement, createPeer, clock = systemClock, onError } = options;
  const listeners = new Set<() => void>();
  const timers = new Set<unknown>();
  let phase: DisplayClientPhase = { phase: 'starting' };
  let state: DisplayState = initialDisplayState;
  let token: string | null = null;
  let closed = false;
  // Bumped whenever the client leaves a claim or a pairing, so a call that settles afterwards is dropped.
  let epoch = 0;
  let link: { peer: PeerLink; deliver(message: SignalMessage): void } | null = null;
  let inboxTimer: unknown = null;
  let lastSeq = -Infinity;
  let lastSnapshot = '';

  const notify = () => listeners.forEach((listener) => listener());
  const setPhase = (next: DisplayClientPhase) => {
    phase = next;
    notify();
  };
  const patchPaired = (patch: Partial<Paired>) => {
    if (phase.phase !== 'paired') return;
    const next: Paired = { ...phase, ...patch };
    if (next.link !== phase.link || next.source !== phase.source || next.online !== phase.online) setPhase(next);
  };
  const report = (error: unknown) => {
    try {
      onError?.(error);
    } catch {
      // A failing error handler must not break the client.
    }
  };
  const live = (session: number) => !closed && session === epoch;
  const after = (ms: number, run: () => void) => {
    const handle = clock.setTimeout(() => {
      timers.delete(handle);
      run();
    }, ms);
    timers.add(handle);
    return handle;
  };
  const linkOpen = () => link?.peer.state === 'open';

  /** Leaves the current claim or pairing: every timer stops, the link closes, and the screen is emptied (d8). */
  const stop = () => {
    epoch += 1;
    timers.forEach((handle) => clock.clearTimeout(handle));
    timers.clear();
    inboxTimer = null;
    const current = link;
    link = null;
    current?.peer.close();
    lastSeq = -Infinity;
    lastSnapshot = '';
    state = initialDisplayState;
  };

  const forget = () => {
    stop();
    token = null;
    tokens.clear().catch(report);
    setPhase({ phase: 'enter-code', error: 'forgotten' });
  };

  /** One token call while paired: a refused token forgets the display; `network` or `server` only marks it offline (d11). */
  async function pairedCall<T>(session: number, work: () => Promise<T>): Promise<{ value: T } | null> {
    try {
      const value = await work();
      if (!live(session)) return null;
      patchPaired({ online: true });
      return { value };
    } catch (error) {
      if (!live(session)) return null;
      const code = codeOf(error);
      if (code === 'token_refused') forget();
      else if (code === 'network' || code === 'server') patchPaired({ online: false });
      else report(error);
      return null;
    }
  }

  const openLink = (session: number, paired: string, offer: SignalMessage) => {
    const previous = link;
    link = null;
    previous?.peer.close();
    let portListener: ((message: SignalMessage) => void) | null = null;
    const peer = createDisplayPeerLink({
      iceServers: advertisement.iceServers,
      createPeer,
      signal: {
        send: (message) => void pairedCall(session, () => signalling.displaySendSignal(context, paired, message)),
        onSignal: (listener) => {
          portListener = listener;
          return () => {
            portListener = null;
          };
        },
      },
    });
    const current = { peer, deliver: (message: SignalMessage) => portListener?.(message) };
    link = current;
    const hello = makeEnvelope('display.hello', { template: DISPLAY_TEMPLATE });
    let configured = false;
    let retry: unknown = null;
    const sayHello = () => {
      if (link !== current || configured) return;
      peer.send(hello);
      retry = after(HELLO_RETRY_MS, sayHello);
    };
    peer.onMessage((envelope) => {
      if (link !== current) return;
      if (!configured) {
        // As useCustomerDisplay: nothing is applied before the config that answers this hello.
        if (envelope.action !== 'display.config' || envelope.id !== hello.id) return;
        configured = true;
        if (retry !== null) clock.clearTimeout(retry);
      }
      state = displayReducer(state, envelope);
      if (phase.phase === 'paired' && phase.source !== 'peer') patchPaired({ source: 'peer' });
      else notify();
    });
    peer.onStateChange((next) => {
      if (link !== current) return;
      patchPaired({ link: next });
      if (next === 'open') sayHello();
      if (next !== 'closed') return;
      link = null;
      patchPaired({ link: 'none' });
      if (inboxTimer !== null) {
        clock.clearTimeout(inboxTimer);
        timers.delete(inboxTimer);
        inboxTimer = after(SIGNAL_POLL_MS, () => void pollInbox(session, paired));
      }
    });
    patchPaired({ link: peer.state });
    current.deliver(offer);
  };

  async function pollInbox(session: number, paired: string) {
    inboxTimer = null;
    const result = await pairedCall(session, () => signalling.displayReceiveSignals(context, paired));
    if (!live(session)) return;
    for (const message of result?.value ?? []) {
      if (!live(session)) return;
      if (message.type === 'offer') openLink(session, paired, message);
      else if (message.type === 'ice') link?.deliver(message);
    }
    inboxTimer = after(linkOpen() ? OPEN_SIGNAL_POLL_MS : SIGNAL_POLL_MS, () => void pollInbox(session, paired));
  }

  const applySnapshot = (body: unknown) => {
    if (body === null || linkOpen()) return;
    const parsed = parseSnapshot(body);
    if (!parsed) return report(new Error('display snapshot: malformed body ignored'));
    const key = JSON.stringify(body);
    if (parsed.seq < lastSeq || key === lastSnapshot) return;
    lastSeq = parsed.seq;
    lastSnapshot = key;
    state = displayReducer(displayReducer(state, parsed.config), parsed.event);
    if (phase.phase === 'paired' && phase.source !== 'snapshot') patchPaired({ source: 'snapshot' });
    else notify();
  };

  async function pollSnapshot(session: number, paired: string) {
    if (!linkOpen()) {
      const result = await pairedCall(session, () => signalling.readSnapshot(context, paired));
      if (!live(session)) return;
      if (result) applySnapshot(result.value);
    }
    after(SNAPSHOT_POLL_MS, () => void pollSnapshot(session, paired));
  }

  const startPaired = (paired: string) => {
    token = paired;
    setPhase({ phase: 'paired', link: 'none', source: 'none', online: true });
    const session = epoch;
    void pollInbox(session, paired);
    if (advertisement.snapshot) void pollSnapshot(session, paired);
  };

  async function pollCollect(session: number, claimSecret: string) {
    try {
      const result = await signalling.collect(context, claimSecret);
      if (!live(session)) return;
      if (result.status === 'pending') {
        if (phase.phase === 'waiting' && phase.checkCode !== result.checkCode) setPhase({ phase: 'waiting', checkCode: result.checkCode });
        after(COLLECT_POLL_MS, () => void pollCollect(session, claimSecret));
        return;
      }
      await tokens.save(result.token).catch(report);
      if (live(session)) startPaired(result.token);
    } catch (error) {
      if (!live(session)) return;
      const code = codeOf(error);
      // The claim secret outlives a dropped request, so a transport failure keeps waiting rather than strand the claim.
      if (code === 'network' || code === 'server') after(COLLECT_POLL_MS, () => void pollCollect(session, claimSecret));
      else setPhase({ phase: 'enter-code', error: 'collect_refused' });
    }
  }

  const loading = tokens.load().then(
    (stored) => {
      token = stored;
      if (closed || phase.phase !== 'starting') return;
      if (stored) startPaired(stored);
      else setPhase({ phase: 'enter-code' });
    },
    (error: unknown) => {
      report(error);
      if (!closed && phase.phase === 'starting') setPhase({ phase: 'enter-code' });
    },
  );

  return {
    get phase() {
      return phase;
    },
    get state() {
      return state;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async claim(code, displayName) {
      if (closed || phase.phase === 'claiming' || phase.phase === 'waiting') return;
      stop();
      const session = epoch;
      setPhase({ phase: 'claiming' });
      await loading;
      if (!live(session)) return;
      try {
        const { claimSecret, checkCode } = await signalling.claim(context, { code, displayName, ...(token ? { token } : {}) });
        if (!live(session)) return;
        setPhase({ phase: 'waiting', checkCode });
        after(COLLECT_POLL_MS, () => void pollCollect(session, claimSecret));
      } catch (error) {
        if (!live(session)) return;
        const refusal = codeOf(error);
        if (refusal !== 'claim_refused' && refusal !== 'network' && refusal !== 'server') report(error);
        setPhase({ phase: 'enter-code', error: refusal === 'claim_refused' || refusal === 'network' ? refusal : 'server' });
      }
    },
    cancel() {
      if (closed || (phase.phase !== 'claiming' && phase.phase !== 'waiting')) return;
      stop();
      setPhase({ phase: 'enter-code' });
    },
    close() {
      if (closed) return;
      stop();
      closed = true;
      listeners.clear();
    },
  };
}
