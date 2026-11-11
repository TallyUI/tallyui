import {
  DisplaySignallingError, type DisplayAdvertisement, type DisplayRecord, type DisplaySignalling, type SignalMessage,
  type SyncContext,
} from '@tallyui/core';
import type { ReceiptData } from '../receipt/types';
import { createDisplayLink, type DisplayLink } from './display-link';
import type { DisplayConfig, DisplayEnvelope, DisplayPayment } from './protocol';
import { createSnapshotSender, quietly, type ServiceClock, type SnapshotSender } from './snapshot-fallback';
import type { DisplayTransport } from './transport';
import { createTillPeerLink, type PeerFactory, type PeerLink, type PeerLinkState, type SignalPort } from './webrtc';

export type { ServiceClock } from './snapshot-fallback';

/** How often the till drains its signal inbox while a link is connecting; TallyUI's choice. */
export const SIGNAL_POLL_MS = 1000;
/** How often the till lists its displays; TallyUI's choice. */
export const LIST_POLL_MS = 10_000;
/** How long a link may stay connecting before it counts as a drop; TallyUI's choice. */
export const CONNECT_TIMEOUT_MS = 30_000;

export interface TillDisplayServiceOptions {
  signalling: DisplaySignalling;
  /** The cashier session; null while nobody is logged in, which stops every server call (d5). */
  context: () => SyncContext | null;
  /** The till's own device id (d5); U8 stores it. */
  deviceId: string;
  advertisement: DisplayAdvertisement;
  /** One display's config: the store, i18n and idle settings, with `display` from its record. */
  configFor: (display: DisplayRecord) => DisplayConfig;
  createPeer?: PeerFactory;
  clock?: ServiceClock;
  /** Every refused or failed server call, for logs. Never throws into the service. */
  onError?: (error: unknown) => void;
}
export type TillDisplayStatus = 'online' | 'offline' | 'paused' | 'closed';
export interface TillDisplayEntry { display: DisplayRecord; link: PeerLinkState }
export interface TillDisplayService extends DisplayLink {
  readonly status: TillDisplayStatus;
  /** The owned displays from the last successful list, each with its current link's state. */
  readonly displays: readonly TillDisplayEntry[];
  /** Called after any change to `status` or `displays`; returns the unsubscribe. */
  onChange(listener: () => void): () => void;
  /** Lists now (U5 calls it after a confirm or a forget); resolves when that list settles. A `paused` service tries again. */
  refresh(): Promise<void>;
}

const systemClock: ServiceClock = {
  now: () => Date.now(),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** The sale states a display shows: its current event, which the snapshot carries. */
const SALE_ACTIONS: ReadonlySet<string> = new Set(['cart.updated', 'payment.state', 'display.idle']);
/** Handed to a snapshot sender in place of a POST while the server is lost or paused; retried, never logged. */
const NOT_SENT = new DisplaySignallingError('network', 'not sent: the display service is offline or paused');

type Call = ['cart', ReceiptData | null] | ['payment', ReceiptData, DisplayPayment];

interface Slot {
  id: string;
  record: DisplayRecord;
  config: DisplayConfig;
  /**
   * The snapshot `seq`: the first link's is the time the display was listed, and each later link's one more. A display
   * ignores a `seq` below the highest it applied (U5a), so it must not start again from 1 when the till reloads.
   */
  seq: number;
  link: PeerLink | null;
  view: DisplayLink | null;
  deliver: ((message: SignalMessage) => void) | null;
  connectTimer: unknown;
  event: DisplayEnvelope | null;
  sender: SnapshotSender;
}

/**
 * The till's second-device displays (ADR-085 U4): one WebRTC link and one display link per owned display, each sale
 * state fanned out to all of them (d9), the snapshot fallback while a channel is not open (d8), and d11 when the
 * server is lost. It is a `DisplayLink`, so `createSaleDisplayPublisher` drives it.
 */
export function createTillDisplayService(options: TillDisplayServiceOptions): TillDisplayService {
  const { signalling, deviceId, advertisement, configFor, createPeer, clock = systemClock } = options;
  const slots = new Map<string, Slot>();
  const listeners = new Set<() => void>();
  let status: TillDisplayStatus = 'online';
  // A `forbidden` pause stops every call until refresh(); a null context pauses without one, and the list timer
  // keeps reading context() so the till picks its displays up again when a cashier logs in (d5).
  let forbidden = false;
  let latest: Call | null = null;
  let entries: readonly TillDisplayEntry[] = [];
  const timers: { list: unknown; signal: unknown } = { list: null, signal: null };
  let signalBusy = false;
  let listGeneration = 0;

  const report = (error: unknown) => quietly(() => options.onError?.(error));
  const stopTimer = (which: keyof typeof timers) => {
    if (timers[which] !== null) clock.clearTimeout(timers[which]);
    timers[which] = null;
  };
  const emit = () => {
    entries = [...slots.values()].map((slot) => ({ display: slot.record, link: slot.link?.state ?? 'closed' }));
    listeners.forEach(quietly);
  };
  const push = (slot: Slot) => slot.sender.update({
    active: advertisement.snapshot && status === 'online' && slot.record.connected && slot.link?.state !== 'open',
    seq: slot.seq, config: slot.config, event: slot.event,
  });
  const setStatus = (next: TillDisplayStatus) => {
    if (status === next || status === 'closed') return;
    status = next;
    slots.forEach(push);
    if (next === 'online') ensureSignalPoll();
    emit();
  };

  /** The context for a server call, or null when none may be made now. */
  const contextNow = (): SyncContext | null => {
    if (status === 'closed' || forbidden) return null;
    const ctx = options.context();
    if (!ctx) setStatus('paused');
    return ctx;
  };
  /** The service's reading of a failed call: d11 for a lost server, a pause, or a display that is gone. */
  const handle = (error: unknown, displayId?: string) => {
    if (status === 'closed' || !(error instanceof DisplaySignallingError)) return;
    if (error.code === 'network' || error.code === 'server') {
      if (!forbidden) setStatus('offline');
    } else if (error.code === 'forbidden') {
      forbidden = true;
      stopTimer('list');
      setStatus('paused');
    } else if (error.code === 'not_found' && displayId !== undefined) {
      remove(displayId);
      emit();
    }
  };
  /** A server call whose failure is logged and handled, never thrown; `null` when it failed or was not made. */
  const call = async <T>(work: (ctx: SyncContext) => Promise<T>, displayId?: string): Promise<{ value: T } | null> => {
    try {
      const ctx = contextNow();
      return ctx ? { value: await work(ctx) } : null;
    } catch (error) {
      report(error);
      handle(error, displayId);
      return null;
    }
  };

  function ensureSignalPoll() {
    if (timers.signal !== null || signalBusy || status === 'closed' || status === 'paused') return;
    if (![...slots.values()].some((slot) => slot.link?.state === 'connecting')) return;
    timers.signal = clock.setTimeout(async () => {
      timers.signal = null;
      signalBusy = true;
      const result = await call((ctx) => signalling.receiveSignals(ctx, deviceId));
      signalBusy = false;
      for (const { displayId, type, payload } of result?.value ?? []) slots.get(displayId)?.deliver?.({ type, payload });
      ensureSignalPoll();
    }, SIGNAL_POLL_MS);
  }

  /** Closes a display's link and its display link; its snapshot sender carries on with the current event. */
  const dropLink = (slot: Slot) => {
    const { link, view, connectTimer } = slot;
    if (!link) return;
    slot.link = slot.view = slot.deliver = null;
    clock.clearTimeout(connectTimer);
    view?.close();
    link.close();
  };
  function remove(displayId: string) {
    const slot = slots.get(displayId);
    if (!slot) return;
    slots.delete(displayId);
    slot.sender.stop();
    dropLink(slot);
  }

  const connect = (slot: Slot) => {
    if (status !== 'online' || slot.link) return;
    slot.seq += 1;
    const port: SignalPort = {
      send: (message) => void call((ctx) => signalling.sendSignal(ctx, deviceId, slot.id, message), slot.id),
      onSignal: (listener) => {
        slot.deliver = listener;
        return () => void (slot.deliver === listener && (slot.deliver = null));
      },
    };
    const link = createTillPeerLink({ signal: port, iceServers: advertisement.iceServers, createPeer });
    // The tee: each sale state the display link sends is that display's current event, for its snapshot.
    const tee: DisplayTransport = {
      send(envelope) {
        if (SALE_ACTIONS.has(envelope.action) && slot.link === link) {
          slot.event = envelope;
          push(slot);
        }
        return link.send(envelope);
      },
      onMessage: (listener) => link.onMessage(listener),
      close: () => link.close(),
    };
    slot.link = link;
    slot.view = createDisplayLink(tee, { config: slot.config, clock });
    slot.connectTimer = clock.setTimeout(() => {
      if (slot.link === link && link.state === 'connecting') link.close();
    }, CONNECT_TIMEOUT_MS);
    link.onStateChange((state) => {
      if (slot.link !== link) return;
      if (state === 'closed') dropLink(slot);
      push(slot);
      emit();
    });
    if (latest?.[0] === 'cart') slot.view.showCart(latest[1]);
    else if (latest) slot.view.showPayment(latest[1], latest[2]);
    ensureSignalPoll();
  };

  const addSlot = (record: DisplayRecord): Slot => {
    const id = record.displayId;
    const sender = createSnapshotSender({
      clock,
      onError: (error) => void (error !== NOT_SENT && report(error)),
      post: async (body) => {
        const ctx = status === 'online' ? contextNow() : null;
        if (!ctx) throw NOT_SENT;
        await signalling.postSnapshot(ctx, deviceId, id, body).catch((error: unknown) => {
          handle(error, id);
          throw error;
        });
      },
    });
    const slot: Slot = {
      id, record, config: configFor(record), seq: clock.now() - 1, link: null, view: null, deliver: null, connectTimer: null, event: null, sender,
    };
    slots.set(id, slot);
    return slot;
  };

  const reconcile = (records: readonly DisplayRecord[]) => {
    const listed = new Set(records.map((record) => record.displayId));
    for (const id of [...slots.keys()]) if (!listed.has(id)) remove(id);
    for (const record of records) {
      let slot = slots.get(record.displayId);
      if (slot) Object.assign(slot, { record, config: configFor(record) });
      else slot = addSlot(record);
      connect(slot);
      push(slot);
    }
    emit();
  };

  async function listNow(): Promise<void> {
    stopTimer('list');
    const generation = ++listGeneration;
    const result = await call((ctx) => signalling.list(ctx, deviceId));
    if (status === 'closed' || generation !== listGeneration) return;
    if (result) {
      setStatus('online');
      // A configFor that throws is logged, and the next list tries again.
      try {
        reconcile(result.value);
      } catch (error) {
        report(error);
      }
    }
    if (!forbidden) timers.list = clock.setTimeout(() => void listNow(), LIST_POLL_MS);
  }
  void listNow();

  const fanOut = (next: Call) => {
    if (status === 'closed') return;
    latest = next;
    for (const { view } of slots.values()) {
      if (next[0] === 'cart') view?.showCart(next[1]);
      else view?.showPayment(next[1], next[2]);
    }
  };

  return {
    get status() { return status; },
    get displays() { return entries; },
    onChange(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    refresh() {
      if (status === 'closed') return Promise.resolve();
      forbidden = false;
      return listNow();
    },
    showCart: (receipt) => fanOut(['cart', receipt]),
    showPayment: (receipt, payment) => fanOut(['payment', receipt, payment]),
    close() {
      if (status === 'closed') return;
      stopTimer('list');
      stopTimer('signal');
      for (const id of [...slots.keys()]) remove(id);
      status = 'closed';
      emit();
      listeners.clear();
    },
  };
}
