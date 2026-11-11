import { DisplaySignallingError } from '@tallyui/core';
import type { DisplayClock } from './display-link';
import type { DisplayConfig, DisplayEnvelope } from './protocol';
import { encode, MAX_MESSAGE_BYTES, messageBytes } from './snapshot';

/** A display clock that also tells the time, for the snapshot re-send and the idle clear. */
export interface ServiceClock extends DisplayClock { now(): number }

export interface SnapshotBody { v: 1; seq: number; config: DisplayConfig; event: DisplayEnvelope }

export interface SnapshotSenderOptions {
  post: (body: SnapshotBody) => Promise<void>;
  clock: ServiceClock;
  onError?: (error: unknown) => void;
}

export interface SnapshotSender {
  /** The display's latest state. `active` is whether the fallback runs now. */
  update(state: { active: boolean; seq: number; config: DisplayConfig; event: DisplayEnvelope | null }): void;
  stop(): void;
}

// Rate and re-send follow WCPOS v2's display-session.ts (ADR-085 context and d8).
export const SNAPSHOT_MIN_INTERVAL_MS = 1000;
export const SNAPSHOT_RESEND_MS = 20_000;
/** The server keeps a snapshot for at most 60 s (ADR-085 d8). */
export const SNAPSHOT_LIFETIME_MS = 60_000;

type State = Parameters<SnapshotSender['update']>[0];
interface Body { body: SnapshotBody; key: string; idle: boolean }

const retryable = (error: unknown) =>
  !(error instanceof DisplaySignallingError) || error.code === 'network' || error.code === 'server';
/** Runs a caller's function (a logger, a listener) so that its throw never reaches the fallback or the service. */
export const quietly = (run: () => void) => {
  try {
    run();
  } catch {
    // The caller's failure is its own.
  }
};

/** One display's snapshot fallback (ADR-085 d8): it posts the display's state while its data channel is not open. */
export function createSnapshotSender({ post, clock, onError }: SnapshotSenderOptions): SnapshotSender {
  let state: State | null = null;
  let stopped = false;
  let inFlight = false;
  let timer: unknown = null;
  let timerFor: 'change' | 'resend' | null = null;
  // The last POST that settled, the body the server refused for good, and the last body over the cap.
  let last: { key: string; at: number; ok: boolean } | null = null;
  let refused: string | null = null;
  let oversize: string | null = null;
  // When a non-idle body last reached the server, and whether an idle body must clear it (rule 6).
  let cartPostedAt: number | null = null;
  let clearing = false;

  const report = (error: unknown) => quietly(() => onError?.(error));
  const clear = () => {
    if (timer !== null) clock.clearTimeout(timer);
    timer = timerFor = null;
  };
  const recent = () => cartPostedAt !== null && clock.now() - cartPostedAt < SNAPSHOT_LIFETIME_MS;

  const current = (): Body | null => {
    if (!state?.event) return null;
    const body: SnapshotBody = { v: 1, seq: state.seq, config: state.config, event: JSON.parse(encode(state.event)) };
    const key = JSON.stringify(body);
    if (messageBytes(key) > MAX_MESSAGE_BYTES) {
      if (key !== oversize) report(new DisplaySignallingError('too_large'));
      oversize = key;
      return null;
    }
    return { body, key, idle: state.event.action === 'display.idle' };
  };
  /** The body to post now or later, or null when nothing should go. */
  const wanted = (): Body | null => {
    const next = current();
    if (!next || next.key === refused) return null;
    return state?.active || (next.idle && clearing) ? next : null;
  };

  const schedule = () => {
    if (stopped || inFlight) return;
    const next = wanted();
    if (!next) return clear();
    if (last?.key === next.key) {
      // The same body again: a success is re-sent only while active, and a retryable failure is retried, each at the re-send.
      if (last.ok && !state?.active) return clear();
      if (timerFor === 'resend') return;
      clear();
      timerFor = 'resend';
      timer = clock.setTimeout(fire, Math.max(0, last.at + SNAPSHOT_RESEND_MS - clock.now()));
      return;
    }
    // A changed body: trailing edge, so whatever is latest when the timer fires is posted.
    if (timerFor === 'change') return;
    clear();
    timerFor = 'change';
    timer = clock.setTimeout(fire, SNAPSHOT_MIN_INTERVAL_MS);
  };

  function fire() {
    timer = timerFor = null;
    if (stopped || inFlight) return;
    const next = wanted();
    if (!next) return;
    if (last?.key === next.key && clock.now() < last.at + SNAPSHOT_RESEND_MS) return schedule();
    inFlight = true;
    // The executor runs `post` now, and turns a synchronous throw into a rejection.
    void new Promise<void>((resolve) => resolve(post(next.body))).then(() => {
      last = { key: next.key, at: clock.now(), ok: true };
      cartPostedAt = next.idle ? null : clock.now();
      // An idle body has cleared the server; a cart that landed after the sale went idle must be cleared in turn.
      clearing = !next.idle && state?.event?.action === 'display.idle';
    }, (error: unknown) => {
      report(error);
      if (!retryable(error)) refused = next.key;
      last = { key: next.key, at: clock.now(), ok: false };
    }).finally(() => {
      inFlight = false;
      schedule();
    });
  }

  return {
    update(next) {
      if (stopped) return;
      state = next;
      clearing = next.event?.action === 'display.idle' && (clearing || recent());
      schedule();
    },
    stop() {
      stopped = true;
      clear();
    },
  };
}
