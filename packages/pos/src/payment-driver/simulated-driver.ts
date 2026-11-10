// Ported from WCPOS v2 packages/core/src/services/payment-drivers/simulated-driver.ts (monorepo 5ac185b0).
import type { CollectResult, DriverAvailability, DriverStatus, PaymentDriver, ReaderInfo } from './types';

export const SIMULATED_PROVIDER = 'simulated';
export const SIMULATED_TIMING = { connectMs: 300, decisionMs: 500, readWindowMs: 1500 } as const;
export type SimulatedReaderId = 'sim-approve' | 'sim-decline' | 'sim-cancel' | 'sim-timeout' | 'sim-tip' | 'sim-tap';
export interface SimulatedDriverOptions {
  /** Override any of the delays in SIMULATED_TIMING. */
  timing?: Partial<{ connectMs: number; decisionMs: number; readWindowMs: number }>;
  /** Timer functions; default to globalThis.setTimeout / clearTimeout. */
  timers?: {
    setTimeout: (fn: () => void, ms: number) => unknown;
    clearTimeout: (handle: unknown) => void;
  };
  /** What `availability()` returns; default `{ available: true }`. */
  availability?: DriverAvailability;
}

export function createSimulatedDriver(options: SimulatedDriverOptions = {}): PaymentDriver {
  const timing = { ...SIMULATED_TIMING, ...options.timing };
  const timers = options.timers ?? {
    setTimeout: (fn: () => void, ms: number) => globalThis.setTimeout(fn, ms),
    clearTimeout: (handle: unknown) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  const ids: SimulatedReaderId[] = ['sim-approve', 'sim-decline', 'sim-cancel', 'sim-timeout', 'sim-tip', 'sim-tap'];
  const readers: ReaderInfo[] = ids.map((id) => ({
    id,
    label: `Simulated ${id.slice(4)}`,
    model: 'Simulated reader',
    battery: 82,
    transport: id === 'sim-tap' ? 'tap_to_pay' : 'bluetooth',
  }));
  let status: DriverStatus = { connection: 'disconnected', reader: null };
  const listeners = new Set<(status: DriverStatus) => void>();
  let cancelCollection: (() => void) | undefined;
  const publish = (next: DriverStatus) => {
    status = next;
    listeners.forEach((listener) => listener(status));
  };
  return {
    provider: SIMULATED_PROVIDER,
    capabilities: { discovery: 'harness', cancel: 'app', refund: false },
    availability: () => options.availability ?? { available: true },
    async discoverReaders(transport) {
      return readers.filter((reader) => reader.transport === transport);
    },
    async connect(reader) {
      publish({ connection: 'connecting', reader });
      await new Promise<void>((resolve) => { timers.setTimeout(resolve, timing.connectMs); });
      publish({ connection: 'connected', reader });
    },
    async disconnect() {
      cancelCollection?.();
      publish({ connection: 'disconnected', reader: null });
    },
    status$: {
      get: () => status,
      subscribe(listener) {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      },
    },
    collect(input) {
      const reader = status.reader;
      if (status.connection !== 'connected' || !reader) return Promise.reject(new Error('No reader connected'));
      if (cancelCollection) return Promise.reject(new Error('Reader is in use'));
      return new Promise<CollectResult>((resolve) => {
        const pending: { timer?: unknown } = {};
        const base = {
          providerRefs: { reference: 'sim_' + input.legId },
          receipt: { brand: 'visa', last4: '4242' },
          amountMinor: input.amountMinor,
          transport: input.transport,
        };
        const finish = (result: CollectResult) => {
          if (pending.timer !== undefined) timers.clearTimeout(pending.timer);
          cancelCollection = undefined;
          resolve(result);
        };
        cancelCollection = () => finish({ ...base, outcome: 'cancelled' });
        const result: CollectResult = { ...base, outcome: 'captured' };
        switch (reader.id) {
          case 'sim-cancel':
            return;
          case 'sim-decline':
            result.outcome = 'declined';
            result.failureReason = 'card_declined';
            break;
          case 'sim-timeout':
            result.outcome = 'cancelled';
            result.failureReason = 'timed_out';
            break;
          case 'sim-tip':
            result.amountMinor = input.amountMinor + (input.tipEligibleMinor === null ? 0 : Math.round(input.tipEligibleMinor / 10));
            break;
        }
        pending.timer = timers.setTimeout(() => finish(result), reader.id === 'sim-timeout' ? timing.readWindowMs : timing.decisionMs);
      });
    },
    async cancel() {
      cancelCollection?.();
    },
  };
}
