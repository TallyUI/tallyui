import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { TillDisplayEntry, TillDisplayService, TillDisplayStatus } from './till-display-service';
import type { PairingPhase, TillPairing } from './till-pairing';
import { useTillDisplays, useTillPairing } from './use-till-pairing';
import { record } from './fake-signalling.test-helper';

/** A store with `onChange` and a `set` that changes its fields and tells the listeners. */
function store<T extends object>(initial: T) {
  const listeners = new Set<() => void>();
  const state = { ...initial };
  const source = {
    onChange(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    set(next: Partial<T>) {
      Object.assign(state, next);
      listeners.forEach((listener) => listener());
    },
  };
  for (const key of Object.keys(initial)) Object.defineProperty(source, key, { get: () => state[key as keyof T] });
  return source;
}

describe('useTillPairing', () => {
  it('re-renders on a change, with a view that stays the same object between changes', () => {
    const idle: PairingPhase = { phase: 'idle' };
    const fake = store({ phase: idle as PairingPhase, forgetError: null as string | null });
    const { result, rerender } = renderHook(() => useTillPairing(fake as unknown as TillPairing));
    const first = result.current;
    expect(first).toEqual({ phase: idle, forgetError: null });
    rerender();
    expect(result.current).toBe(first);
    const code: PairingPhase = { phase: 'code', code: '100001', expiresAt: '2026-11-11T10:10:00.000Z', claims: [] };
    act(() => fake.set({ phase: code }));
    expect(result.current).toEqual({ phase: code, forgetError: null });
    act(() => fake.set({ forgetError: 'not_found' }));
    expect(result.current.forgetError).toBe('not_found');
  });

  it('gives idle with no forget error for a null pairing', () => {
    const { result } = renderHook(() => useTillPairing(null));
    expect(result.current).toEqual({ phase: { phase: 'idle' }, forgetError: null });
  });
});

describe('useTillDisplays', () => {
  it('re-renders on a change, with a view that stays the same object between changes', () => {
    const fake = store({ status: 'online' as TillDisplayStatus, displays: [] as readonly TillDisplayEntry[] });
    const { result, rerender } = renderHook(() => useTillDisplays(fake as unknown as TillDisplayService));
    const first = result.current;
    expect(first).toEqual({ status: 'online', displays: [] });
    rerender();
    expect(result.current).toBe(first);
    const displays: TillDisplayEntry[] = [{ display: record('d1'), link: 'open' }];
    act(() => fake.set({ displays }));
    expect(result.current).toEqual({ status: 'online', displays });
    act(() => fake.set({ status: 'offline' }));
    expect(result.current.status).toBe('offline');
  });

  it('gives closed with no displays for a null service', () => {
    const { result } = renderHook(() => useTillDisplays(null));
    expect(result.current).toEqual({ status: 'closed', displays: [] });
  });
});
