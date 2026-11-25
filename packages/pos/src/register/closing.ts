import type * as store from './session-store';

// The close in flight per register, which a second close joins; its listeners re-render `closing`.
export const closingByRegister = new Map<string, ReturnType<typeof store.writeClosure>>();
const closingListeners = new Set<() => void>();
export const notifyClosing = () => closingListeners.forEach((listener) => listener());
export const subscribeClosing = (listener: () => void) => {
  closingListeners.add(listener);
  return () => { closingListeners.delete(listener); };
};

/** A `closeSession` for this register is in flight, in any hook instance. */
export function isRegisterClosing(registerId: string): boolean {
  return closingByRegister.has(registerId);
}
