import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createDisplayClient } from './display-client';
import { initialDisplayState } from './display-state';
import { FakeDisplaySignalling } from './fake-display-signalling.test-helper';
import { useDisplayClient } from './use-display-client';

describe('useDisplayClient', () => {
  it('re-renders on a change, and returns the same object between changes', async () => {
    const client = createDisplayClient({
      signalling: new FakeDisplaySignalling(), context: { baseUrl: 'https://store.test' },
      tokens: { load: async () => null, save: async () => {}, clear: async () => {} },
      advertisement: { iceServers: [], snapshot: false },
    });
    const { result, rerender } = renderHook(() => useDisplayClient(client));
    expect(result.current).toEqual({ phase: { phase: 'starting' }, state: initialDisplayState });
    await act(async () => {});
    expect(result.current.phase).toEqual({ phase: 'enter-code' });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    await act(() => client.claim('123456', 'Counter'));
    expect(result.current.phase).toEqual({ phase: 'waiting', checkCode: '4321' });
    act(() => client.close());
  });

  it('gives starting for a null client', () => {
    const { result } = renderHook(() => useDisplayClient(null));
    expect(result.current).toEqual({ phase: { phase: 'starting' }, state: initialDisplayState });
  });
});
