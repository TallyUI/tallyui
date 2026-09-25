import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OutboxState } from '@tallyui/pos';
import { SyncStatus } from '../sale/sync-status';

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('SyncStatus', () => {
  it('shows "All sales synced" when nothing is pending', () => {
    render(<SyncStatus state={{ pending: 0, sending: false }} />);
    expect(screen.getByLabelText('Sync status').textContent).toBe('All sales synced');
  });
  it('pluralizes a single pending sale', () => {
    render(<SyncStatus state={{ pending: 1, sending: false }} />);
    expect(screen.getByLabelText('Sync status').textContent).toBe('1 sale waiting to sync');
  });
  it('pluralizes several pending sales', () => {
    render(<SyncStatus state={{ pending: 3, sending: false }} />);
    expect(screen.getByLabelText('Sync status').textContent).toBe('3 sales waiting to sync');
  });
  it('appends "sending" while a flush is in flight', () => {
    render(<SyncStatus state={{ pending: 2, sending: true }} />);
    expect(screen.getByLabelText('Sync status').textContent).toBe('2 sales waiting to sync · sending');
  });
  it('appends the retry reason and a countdown to the next attempt when not sending', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    const state: OutboxState = { pending: 1, sending: false, lastRetryReason: 'offline', nextAttemptAt: now + 5000 };
    render(<SyncStatus state={state} />);
    expect(screen.getByLabelText('Sync status').textContent).toBe('1 sale waiting to sync · retrying (offline) in 5s');
  });
});
