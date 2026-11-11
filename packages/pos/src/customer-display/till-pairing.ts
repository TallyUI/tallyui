import { DisplaySignallingError, type DisplaySignalling, type PendingPairing, type SyncContext } from '@tallyui/core';
import { quietly, type ServiceClock } from './snapshot-fallback';
import type { TillDisplayService } from './till-display-service';

/** How often the till lists the claims on its code while it shows one; TallyUI's choice. */
export const PENDING_POLL_MS = 2000;

export type PairingError = 'forbidden' | 'limit' | 'expired' | 'not_found' | 'network' | 'server';
export type PairingPhase =
  | { phase: 'idle'; error?: PairingError }
  | { phase: 'minting' }
  | { phase: 'code'; code: string; expiresAt: string; claims: PendingPairing[] }
  | { phase: 'confirming'; claimId: string };
export interface TillPairingOptions {
  signalling: DisplaySignalling;
  /** The cashier session; null while nobody is logged in, which refuses every call as `forbidden` (d5). */
  context: () => SyncContext | null;
  /** The till's own device id (d5). */
  deviceId: string;
  /** U4's service, refreshed after a confirm or a forget. */
  service?: Pick<TillDisplayService, 'refresh'>;
  clock?: ServiceClock;
  /** Every refused or failed call, for logs. Never throws into the pairing. */
  onError?: (error: unknown) => void;
}
export interface TillPairing {
  readonly phase: PairingPhase;
  /** The last forget's refusal, cleared by the next forget. */
  readonly forgetError: PairingError | null;
  /** Called after any change to `phase` or `forgetError`; returns the unsubscribe. */
  onChange(listener: () => void): () => void;
  start(): Promise<void>;
  confirm(claimId: string): Promise<void>;
  decline(claimId: string): Promise<void>;
  /** Back to idle; the minted code is left to expire on the server. */
  cancel(): void;
  forget(displayId: string): Promise<void>;
  close(): void;
}

const systemClock: ServiceClock = {
  now: () => Date.now(),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const NAMED: ReadonlySet<string> = new Set<PairingError>(['forbidden', 'limit', 'expired', 'not_found', 'network', 'server']);
/** A signalling refusal keeps its code; anything else is `server`. */
const nameOf = (error: unknown): PairingError =>
  error instanceof DisplaySignallingError && NAMED.has(error.code) ? (error.code as PairingError) : 'server';

/**
 * The till's pairing flow (ADR-085 U5, d4, d5): mint a code, list its claims with each display's check code (#705),
 * confirm or decline one, and forget a paired display. Framework-free; `useTillPairing` renders it.
 */
export function createTillPairing(options: TillPairingOptions): TillPairing {
  const { signalling, deviceId, service, clock = systemClock } = options;
  const listeners = new Set<() => void>();
  let phase: PairingPhase = { phase: 'idle' };
  let forgetError: PairingError | null = null;
  let closed = false;
  // Bumped on each change of flow, so a call that settles after it is ignored.
  let epoch = 0;
  // The one timer while a code shows: the next poll, or the expiry when that comes first.
  let timer: unknown = null;

  const report = (error: unknown) => quietly(() => options.onError?.(error));
  const emit = () => listeners.forEach(quietly);
  const setPhase = (next: PairingPhase) => {
    if (next.phase !== 'code' && timer !== null) {
      clock.clearTimeout(timer);
      timer = null;
    }
    phase = next;
    emit();
  };
  const idle = (error?: PairingError) => setPhase(error ? { phase: 'idle', error } : { phase: 'idle' });
  /** Runs one signalling call with the cashier session; a missing session is a `forbidden` refusal, with no call. */
  const run = <T>(work: (ctx: SyncContext) => Promise<T>): Promise<T> => {
    const ctx = options.context();
    return ctx ? work(ctx) : Promise.reject(new DisplaySignallingError('forbidden', 'no cashier session'));
  };
  const refresh = async () => {
    if (!closed) await (async () => service?.refresh())().catch(report);
  };

  /** While `mine`'s code shows: expire it at `expiresAt`, else poll its claims in `PENDING_POLL_MS`. */
  const tick = (mine: number) => {
    if (mine !== epoch || phase.phase !== 'code') return;
    const left = Date.parse(phase.expiresAt) - clock.now();
    if (!(left > 0)) return idle('expired');
    timer = clock.setTimeout(left > PENDING_POLL_MS ? () => void poll(mine) : () => tick(mine), Math.min(left, PENDING_POLL_MS));
  };
  const poll = async (mine: number) => {
    timer = null;
    try {
      const claims = await run((ctx) => signalling.pending(ctx, deviceId));
      if (mine === epoch && phase.phase === 'code') setPhase({ ...phase, claims });
    } catch (error) {
      report(error);
      if (mine === epoch && phase.phase === 'code' && nameOf(error) === 'forbidden') idle('forbidden');
    }
    tick(mine);
  };

  return {
    get phase() { return phase; },
    get forgetError() { return forgetError; },
    onChange(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    async start() {
      if (closed) return;
      const mine = ++epoch;
      setPhase({ phase: 'minting' });
      try {
        const { code, expiresAt } = await run((ctx) => signalling.mint(ctx, deviceId));
        if (mine !== epoch) return;
        setPhase({ phase: 'code', code, expiresAt, claims: [] });
        tick(mine);
      } catch (error) {
        report(error);
        if (mine === epoch) idle(nameOf(error));
      }
    },
    async confirm(claimId) {
      if (closed || phase.phase !== 'code') return;
      const mine = ++epoch;
      setPhase({ phase: 'confirming', claimId });
      try {
        await run((ctx) => signalling.confirm(ctx, deviceId, claimId));
      } catch (error) {
        report(error);
        if (mine === epoch) idle(nameOf(error));
        return;
      }
      await refresh();
      if (mine === epoch) idle();
    },
    async decline(claimId) {
      if (closed || phase.phase !== 'code') return;
      const mine = epoch;
      try {
        await run((ctx) => signalling.decline(ctx, deviceId, claimId));
      } catch (error) {
        return report(error);
      }
      if (mine === epoch && phase.phase === 'code') setPhase({ ...phase, claims: phase.claims.filter((claim) => claim.claimId !== claimId) });
    },
    cancel() {
      if (closed) return;
      epoch += 1;
      idle();
    },
    async forget(displayId) {
      if (closed) return;
      if (forgetError !== null) { forgetError = null; emit(); }
      try {
        await run((ctx) => signalling.forget(ctx, deviceId, displayId));
      } catch (error) {
        report(error);
        if (closed) return;
        forgetError = nameOf(error);
        return emit();
      }
      await refresh();
    },
    close() {
      if (closed) return;
      closed = true;
      epoch += 1;
      if (timer !== null) clock.clearTimeout(timer);
      listeners.clear();
    },
  };
}
