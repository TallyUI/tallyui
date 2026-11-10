import { paymentMethodOf } from '@tallyui/core';
import { describe, expect, it, vi } from 'vitest';
import { createPaymentDriverRegistry, driverForMethod } from './registry';
import { createSimulatedDriver } from './simulated-driver';

describe('payment driver registry', () => {
  it('registers by provider and replaces a driver without moving its slot', () => {
    const registry = createPaymentDriverRegistry();
    const first = createSimulatedDriver();
    const other = { ...createSimulatedDriver(), provider: 'other' };
    expect(registry.list()).toEqual([]);
    registry.register(first);
    registry.register(other);
    expect(registry.get('simulated')).toBe(first);
    expect(registry.has('simulated')).toBe(true);
    expect(registry.get('unknown')).toBeUndefined();
    expect(registry.has('unknown')).toBe(false);
    expect(registry.get(null)).toBeUndefined();
    expect(registry.has(null)).toBe(false);
    expect(registry.list()).toEqual([first, other]);
    const replacement = createSimulatedDriver();
    registry.register(replacement);
    expect(registry.get('simulated')).toBe(replacement);
    expect(registry.list()).toEqual([replacement, other]);
    expect(createPaymentDriverRegistry().list()).toEqual([]);
  });

  it('notifies after every registration until unsubscribed', () => {
    const registry = createPaymentDriverRegistry();
    const driver = createSimulatedDriver();
    const listener = vi.fn(() => expect(registry.get(driver.provider)).toBe(driver));
    const unsubscribe = registry.subscribe(listener);
    expect(listener).not.toHaveBeenCalled();
    registry.register(driver);
    expect(listener).toHaveBeenCalledTimes(1);
    registry.register(driver);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    registry.register(driver);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('selects only the primary device capture provider', () => {
    const registry = createPaymentDriverRegistry();
    const driver = createSimulatedDriver();
    registry.register(driver);
    const method = {
      ...paymentMethodOf('external'),
      capture: { mode: 'device', provider: 'simulated', hardware: null },
    };
    expect(driverForMethod(registry, method)).toBe(driver);
    for (const capture of [
      { ...method.capture, mode: 'manual', modes: [method.capture] },
      { ...method.capture, provider: 'unknown' },
      { ...method.capture, provider: null },
    ]) {
      expect(driverForMethod(registry, { ...method, capture })).toBeUndefined();
    }
    expect(driverForMethod(registry, null)).toBeUndefined();
    expect(driverForMethod(registry, undefined)).toBeUndefined();
  });
});
