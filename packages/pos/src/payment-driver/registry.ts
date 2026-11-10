// Ported from WCPOS v2 packages/core/src/services/payment-drivers/registry.ts (monorepo 5ac185b0).
import type { PaymentMethodDescriptor } from '@tallyui/core';
import type { PaymentDriver } from './types';

export interface PaymentDriverRegistry {
  /** Adds the driver under its `provider`, replacing any driver already there, then notifies subscribers. */
  register(driver: PaymentDriver): void;
  get(provider: string | null): PaymentDriver | undefined;
  has(provider: string | null): boolean;
  list(): PaymentDriver[];
  /** Called after every `register`; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export function createPaymentDriverRegistry(): PaymentDriverRegistry {
  const drivers = new Map<string, PaymentDriver>();
  const listeners = new Set<() => void>();
  return {
    register(driver) {
      drivers.set(driver.provider, driver);
      listeners.forEach((listener) => listener());
    },
    get: (provider) => provider === null ? undefined : drivers.get(provider),
    has: (provider) => provider !== null && drivers.has(provider),
    list: () => [...drivers.values()],
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

/** The driver for a method taken on a device: `capture.mode === 'device'` and a driver registered under `capture.provider`. */
export function driverForMethod(
  registry: PaymentDriverRegistry,
  method: PaymentMethodDescriptor | null | undefined,
): PaymentDriver | undefined {
  return method?.capture.mode === 'device' ? registry.get(method.capture.provider) : undefined;
}
