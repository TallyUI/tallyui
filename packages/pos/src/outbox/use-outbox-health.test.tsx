import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { summarizeOutboxHealth } from './outbox-health';
import { useOutboxHealth, type UseOutboxHealthOptions } from './use-outbox-health';

afterEach(cleanup);

describe('useOutboxHealth', () => {
  it('summarizes both states, preserves health identity and flushes both outboxes', async () => {
    let finishSales!: () => void;
    const sales = { state: { pending: 3, rejected: 1, sending: false },
      flush: vi.fn(async () => { await new Promise<void>((resolve) => { finishSales = resolve; }); }) };
    const tillUpdates = { state: { pending: 2, sending: false, authRequired: true }, flush: vi.fn(async () => {}) };
    const view = renderHook((options: UseOutboxHealthOptions) => useOutboxHealth(options), { initialProps: { sales, tillUpdates } });
    const health = view.result.current.health;
    expect(health).toEqual(summarizeOutboxHealth(sales.state, tillUpdates.state));
    view.rerender({ sales: { ...sales }, tillUpdates: { ...tillUpdates } });
    expect(view.result.current.health).toBe(health);
    await act(async () => {
      const flushing = view.result.current.flush();
      expect(sales.flush).toHaveBeenCalledTimes(1);
      expect(tillUpdates.flush).toHaveBeenCalledTimes(1);
      finishSales();
      await flushing;
    });
  });

  it('rejects when the register flush rejects and still calls the order flush', async () => {
    const error = new Error('register flush failed');
    const sales = { state: { pending: 0, sending: false }, flush: vi.fn(async () => {}) };
    const tillUpdates = { state: { pending: 0, sending: false }, flush: vi.fn(async () => { throw error; }) };
    const view = renderHook(() => useOutboxHealth({ sales, tillUpdates }));
    await expect(view.result.current.flush()).rejects.toBe(error);
    expect(sales.flush).toHaveBeenCalledTimes(1);
    expect(tillUpdates.flush).toHaveBeenCalledTimes(1);
  });
});
