import { useSyncExternalStore } from 'react';

const inFlight = new Set<string>();
const listeners = new Set<() => void>();
const subscribe = (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; };

export function claimTake(orderId: string): boolean {
  if (inFlight.has(orderId)) return false;
  inFlight.add(orderId);
  listeners.forEach((notify) => notify());
  return true;
}

export function releaseTake(orderId: string): void {
  inFlight.delete(orderId);
  listeners.forEach((notify) => notify());
}

export function useTakeInFlight(orderId: string): boolean {
  return useSyncExternalStore(subscribe, () => inFlight.has(orderId), () => false);
}
