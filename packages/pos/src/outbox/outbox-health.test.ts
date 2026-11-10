// @vitest-environment node
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { summarizeOutboxHealth, watchOutboxHealth, type OutboxHealth } from './outbox-health';
import type { OutboxState } from './types';

const idle: OutboxState = { pending: 0, sending: false };

describe('outbox health', () => {
  it('idle states give zeros everywhere and no auth requirement', () => {
    expect(summarizeOutboxHealth(idle, idle)).toEqual({ sales: { pending: 0, rejected: 0, stuck: 0 },
      tillUpdates: { pending: 0, rejected: 0, stuck: 0 }, attention: 0, authRequired: false });
  });

  it('counts pending, rejected and stuck rows across both outboxes', () => {
    const sales = { ...idle, pending: 3, rejected: 1,
      stuck: { commandIds: ['a', 'b'], since: 0, reason: 'status_503', orders: [] } };
    expect(summarizeOutboxHealth(sales, { ...idle, pending: 2, rejected: 1 })).toEqual({
      sales: { pending: 3, rejected: 1, stuck: 2 }, tillUpdates: { pending: 2, rejected: 1, stuck: 0 },
      attention: 4, authRequired: false,
    });
  });

  it('requires auth when either outbox is parked on auth', () => {
    expect(summarizeOutboxHealth(idle, { ...idle, authRequired: true }).authRequired).toBe(true);
    expect(summarizeOutboxHealth({ ...idle, authRequired: true }, idle).authRequired).toBe(true);
  });

  it('watches both streams and emits only when health changes', () => {
    const sales$ = new BehaviorSubject(idle);
    const tillUpdates$ = new BehaviorSubject(idle);
    const health: OutboxHealth[] = [];
    const subscription = watchOutboxHealth(sales$, tillUpdates$).subscribe((value) => health.push(value));
    expect(health).toEqual([summarizeOutboxHealth(idle, idle)]);
    sales$.next({ ...idle, sending: true });
    expect(health).toHaveLength(1);
    sales$.next({ ...idle, pending: 1 });
    expect(health).toHaveLength(2);
    expect(health.at(-1)).toEqual(summarizeOutboxHealth(sales$.value, tillUpdates$.value));
    tillUpdates$.next({ ...idle, pending: 2 });
    expect(health).toHaveLength(3);
    expect(health.at(-1)).toEqual(summarizeOutboxHealth(sales$.value, tillUpdates$.value));
    subscription.unsubscribe();
  });
});
