import { paymentMethodOf } from '@tallyui/core';
import { describe, expect, it, vi } from 'vitest';
import { createSimulatedDriver, SIMULATED_PROVIDER, SIMULATED_TIMING } from './simulated-driver';
import type { SimulatedDriverOptions, SimulatedReaderId } from './simulated-driver';
import type { CollectInput, CollectResult } from './types';

function manualTimers() {
  let now = 0;
  let handle = 0;
  const entries = new Map<number, { fn: () => void; ms: number }>();
  return {
    setTimeout(fn: () => void, ms: number) {
      entries.set(++handle, { fn, ms: now + ms });
      return handle;
    },
    clearTimeout(timer: unknown) { entries.delete(timer as number); },
    pending: () => entries.size,
    advance(ms: number) {
      const target = now + ms;
      while (true) {
        const next = [...entries].filter(([, entry]) => entry.ms <= target)
          .sort((a, b) => a[1].ms - b[1].ms)[0];
        if (!next) break;
        now = next[1].ms;
        entries.delete(next[0]);
        next[1].fn();
      }
      now = target;
    },
  };
}

const input: CollectInput = {
  legId: 'leg-1', amountMinor: 1000, currency: 'EUR', transport: 'bluetooth',
  method: {
    ...paymentMethodOf('external'),
    capture: { mode: 'device', provider: 'simulated', hardware: null },
  },
  handoff: null, tipEligibleMinor: 1000,
};
const receipt = { brand: 'visa', last4: '4242' };
const providerRefs = { reference: 'sim_leg-1' };

async function connectedDriver(id: SimulatedReaderId, options: SimulatedDriverOptions = {}) {
  const timers = manualTimers();
  const driver = createSimulatedDriver({ ...options, timers });
  const readers = await driver.discoverReaders!(id === 'sim-tap' ? 'tap_to_pay' : 'bluetooth');
  const reader = readers.find((candidate) => candidate.id === id)!;
  const connection = driver.connect!(reader, null);
  timers.advance(options.timing?.connectMs ?? SIMULATED_TIMING.connectMs);
  await connection;
  return { driver, timers, reader };
}

describe('simulated payment driver', () => {
  it('exposes its provider, capabilities, availability and ordered readers', async () => {
    const driver = createSimulatedDriver({ timers: manualTimers() });
    expect(SIMULATED_PROVIDER).toBe('simulated');
    expect(driver.provider).toBe(SIMULATED_PROVIDER);
    expect(SIMULATED_TIMING).toEqual({ connectMs: 300, decisionMs: 500, readWindowMs: 1500 });
    expect(driver.capabilities).toEqual({ discovery: 'harness', cancel: 'app', refund: false });
    expect(driver.availability()).toEqual({ available: true });
    const availability = { available: false, reason: 'bluetooth_off' } as const;
    expect(createSimulatedDriver({ availability }).availability()).toBe(availability);
    expect(await driver.discoverReaders!('bluetooth', { until: 'sim-approve' })).toEqual(
      ['approve', 'decline', 'cancel', 'timeout', 'tip'].map((name) => ({
        id: `sim-${name}`, label: `Simulated ${name}`, model: 'Simulated reader',
        battery: 82, transport: 'bluetooth',
      })),
    );
    expect(await driver.discoverReaders!('tap_to_pay')).toEqual([{
      id: 'sim-tap', label: 'Simulated tap', model: 'Simulated reader', battery: 82, transport: 'tap_to_pay',
    }]);
    expect(await driver.discoverReaders!('usb')).toEqual([]);
    expect(await driver.discoverReaders!('network')).toEqual([]);
  });

  it('publishes connection changes only until unsubscribed', async () => {
    const timers = manualTimers();
    const driver = createSimulatedDriver({ timers });
    const listener = vi.fn();
    expect(driver.status$.get()).toEqual({ connection: 'disconnected', reader: null });
    const unsubscribe = driver.status$.subscribe(listener);
    expect(listener).not.toHaveBeenCalled();
    const [reader] = await driver.discoverReaders!('bluetooth');
    const connection = driver.connect!(reader, null);
    expect(listener).toHaveBeenNthCalledWith(1, { connection: 'connecting', reader });
    timers.advance(SIMULATED_TIMING.connectMs - 1);
    await Promise.resolve();
    expect(driver.status$.get()).toEqual({ connection: 'connecting', reader });
    expect(listener).toHaveBeenCalledTimes(1);
    timers.advance(1);
    await connection;
    expect(driver.status$.get()).toEqual({ connection: 'connected', reader });
    expect(listener).toHaveBeenNthCalledWith(2, { connection: 'connected', reader });
    await driver.disconnect!();
    expect(driver.status$.get()).toEqual({ connection: 'disconnected', reader: null });
    expect(listener).toHaveBeenNthCalledWith(3, { connection: 'disconnected', reader: null });
    unsubscribe();
    await driver.disconnect!();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['sim-approve', 'captured', 1000, undefined],
    ['sim-decline', 'declined', 1000, 'card_declined'],
    ['sim-tip', 'captured', 1100, undefined],
    ['sim-tap', 'captured', 1000, undefined],
  ] as const)('%s decides at decisionMs with exact payment details', async (id, outcome, amountMinor, failureReason) => {
    const { driver, timers, reader } = await connectedDriver(id);
    let settled = false;
    const collection = driver.collect({ ...input, transport: reader.transport });
    void collection.then(() => { settled = true; });
    timers.advance(SIMULATED_TIMING.decisionMs - 1);
    await Promise.resolve();
    expect(settled).toBe(false);
    timers.advance(1);
    const result = await collection;
    expect(result).toEqual({
      outcome, amountMinor, providerRefs, receipt, transport: reader.transport,
      ...(failureReason ? { failureReason } : {}),
    });
    if (!failureReason) expect(result).not.toHaveProperty('failureReason');
    expect(settled).toBe(true);
  });

  it('times out only when the reader window expires', async () => {
    const { driver, timers } = await connectedDriver('sim-timeout');
    let settled = false;
    const collection = driver.collect(input);
    void collection.then(() => { settled = true; });
    timers.advance(SIMULATED_TIMING.decisionMs);
    await Promise.resolve();
    expect(settled).toBe(false);
    timers.advance(SIMULATED_TIMING.readWindowMs - SIMULATED_TIMING.decisionMs - 1);
    await Promise.resolve();
    expect(settled).toBe(false);
    timers.advance(1);
    expect(await collection).toEqual({
      outcome: 'cancelled', failureReason: 'timed_out', amountMinor: 1000,
      providerRefs, receipt, transport: input.transport,
    });
  });

  it('waits indefinitely on sim-cancel until cancelled', async () => {
    const { driver, timers } = await connectedDriver('sim-cancel');
    let settled = false;
    const collection = driver.collect(input);
    void collection.then(() => { settled = true; });
    timers.advance(SIMULATED_TIMING.readWindowMs * 10);
    await Promise.resolve();
    expect(settled).toBe(false);
    await driver.cancel!();
    const result = await collection;
    expect(result).toEqual({ outcome: 'cancelled', amountMinor: 1000, providerRefs, receipt, transport: input.transport });
    expect(result).not.toHaveProperty('failureReason');
  });

  it('clears a cancelled decision and accepts a subsequent collection', async () => {
    const { driver, timers } = await connectedDriver('sim-approve');
    const collection = driver.collect(input);
    timers.advance(SIMULATED_TIMING.decisionMs / 2);
    await Promise.resolve();
    await driver.cancel!();
    const result = await collection;
    expect(result).toEqual({ outcome: 'cancelled', amountMinor: 1000, providerRefs, receipt, transport: input.transport });
    expect(result).not.toHaveProperty('failureReason');
    expect(timers.pending()).toBe(0);
    timers.advance(SIMULATED_TIMING.decisionMs * 2);
    await Promise.resolve();
    expect(await collection).toBe(result);
    const next = driver.collect({ ...input, legId: 'leg-2' });
    timers.advance(SIMULATED_TIMING.decisionMs);
    expect(await next).toEqual({
      outcome: 'captured', amountMinor: 1000, providerRefs: { reference: 'sim_leg-2' }, receipt, transport: input.transport,
    });
    await driver.cancel!();
    expect(driver.status$.get().connection).toBe('connected');
    expect(timers.pending()).toBe(0);
  });

  it('cancels an in-flight collection when disconnected', async () => {
    const { driver } = await connectedDriver('sim-cancel');
    const collection = driver.collect(input);
    await driver.disconnect!();
    const result = await collection;
    expect(result).toEqual({ outcome: 'cancelled', amountMinor: 1000, providerRefs, receipt, transport: input.transport });
    expect(result).not.toHaveProperty('failureReason');
    expect(driver.status$.get()).toEqual({ connection: 'disconnected', reader: null });
  });

  it('rejects collection before connection and while a reader is in use', async () => {
    const driver = createSimulatedDriver({ timers: manualTimers() });
    await driver.cancel!();
    await expect(driver.collect(input)).rejects.toThrow('No reader connected');
    const connected = await connectedDriver('sim-cancel');
    const collection = connected.driver.collect(input);
    await expect(connected.driver.collect(input)).rejects.toThrow('Reader is in use');
    await connected.driver.cancel!();
    expect((await collection).outcome).toBe('cancelled');
  });

  it('honours a custom decision delay without calling real timers', async () => {
    const realSetTimeout = vi.spyOn(globalThis, 'setTimeout');
    const realClearTimeout = vi.spyOn(globalThis, 'clearTimeout');
    try {
      const { driver, timers } = await connectedDriver('sim-approve', { timing: { decisionMs: 50 } });
      let settled = false;
      const collection = driver.collect(input);
      void collection.then(() => { settled = true; });
      timers.advance(49);
      await Promise.resolve();
      expect(settled).toBe(false);
      timers.advance(1);
      expect((await collection).outcome).toBe('captured');
      expect(settled).toBe(true);
      expect(realSetTimeout).not.toHaveBeenCalled();
      expect(realClearTimeout).not.toHaveBeenCalled();
    } finally {
      realSetTimeout.mockRestore();
      realClearTimeout.mockRestore();
    }
  });

  it.each([[null, 1000], [5, 1001], [14, 1001]] as const)('tips on eligible amount %s using minor-unit rounding', async (tipEligibleMinor, amountMinor) => {
    const { driver, timers } = await connectedDriver('sim-tip');
    const collection = driver.collect({ ...input, tipEligibleMinor, transport: 'network' });
    timers.advance(SIMULATED_TIMING.decisionMs);
    expect(await collection).toEqual({
      outcome: 'captured', amountMinor, providerRefs, receipt, transport: 'network',
    } satisfies CollectResult);
  });
});
