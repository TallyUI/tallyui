import { paymentMethodOf } from '@tallyui/core';
import { describe, expect, it, vi } from 'vitest';
import { createPaymentDriverRegistry, driverForMethod, methodDrivers, methodForProvider } from './registry';
import { createSimulatedDriver } from './simulated-driver';

const cash = paymentMethodOf('cash');
const deviceMethod = (id: string, provider: string) => ({
  ...paymentMethodOf('external'),
  id,
  capture: { mode: 'device', provider, hardware: null },
});
const deviceStripeA = deviceMethod('stripe-a', 'stripe');
const deviceSimulated = deviceMethod('simulated', 'simulated');
const deviceStripeB = deviceMethod('stripe-b', 'stripe');

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

  it('finds the first primary device method for a provider', () => {
    const methods = [cash, deviceStripeA, deviceSimulated, deviceStripeB];
    expect(methodForProvider(methods, 'stripe')).toBe(deviceStripeA);
    expect(methodForProvider(methods, 'simulated')).toBe(deviceSimulated);
    expect(methodForProvider(methods, 'sumup')).toBeNull();
    const manualStripe = { ...deviceStripeA, id: 'manual-stripe', capture: { ...deviceStripeA.capture, mode: 'manual' } };
    expect(methodForProvider([manualStripe], 'stripe')).toBeNull();
    expect(methodForProvider([manualStripe, deviceStripeB], 'stripe')).toBe(deviceStripeB);
    expect(methodForProvider([], 'stripe')).toBeNull();
  });

  it('maps each method with a registered driver to that driver, in methods order', () => {
    const registry = createPaymentDriverRegistry();
    const simulated = createSimulatedDriver();
    registry.register(simulated);
    const webviewSimulated = {
      ...deviceSimulated,
      id: 'webview-simulated',
      capture: { mode: 'webview', provider: 'simulated', hardware: null, modes: [deviceSimulated.capture] },
    };
    const methods = [cash, deviceSimulated, deviceStripeA, webviewSimulated];
    const map = methodDrivers(registry, methods);
    expect(map.size).toBe(1);
    expect(map.get(deviceSimulated.id)).toBe(simulated);
    expect([...map.keys()]).toEqual([deviceSimulated.id]);

    const stripeDriver = { ...createSimulatedDriver(), provider: 'stripe' };
    registry.register(stripeDriver);
    const withStripe = methodDrivers(registry, methods);
    expect([...withStripe.keys()]).toEqual([deviceSimulated.id, deviceStripeA.id]);
    expect([...withStripe.values()]).toEqual([simulated, stripeDriver]);
  });

  it('keeps the first entry for a duplicate method id', () => {
    const registry = createPaymentDriverRegistry();
    const simulated = createSimulatedDriver();
    const stripeDriver = { ...createSimulatedDriver(), provider: 'stripe' };
    registry.register(simulated);
    registry.register(stripeDriver);
    const duplicate = { ...deviceStripeA, id: deviceSimulated.id };
    const map = methodDrivers(registry, [deviceSimulated, duplicate]);
    expect([...map.entries()]).toEqual([[deviceSimulated.id, simulated]]);
  });
});
