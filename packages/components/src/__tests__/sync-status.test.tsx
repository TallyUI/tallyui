import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SyncNotice } from '@tallyui/core';
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
  it('names the stuck orders, the reason and since when, alongside the pending text', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    const since = new Date(2026, 8, 29, 14, 5, 30).getTime();
    const time = new Date(since).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    expect(time).toMatch(/05/);
    expect(time).not.toMatch(/30/);
    const state: OutboxState = { pending: 4, sending: false, lastRetryReason: 'status_503', nextAttemptAt: now + 5000,
      stuck: { commandIds: ['a', 'b'], since, reason: 'status_503',
        orders: ['a', 'b'].map((commandId) => ({ commandId, since, reason: 'status_503' })) } };
    render(<SyncStatus state={state} />);
    expect(screen.getByLabelText('Sync status').textContent)
      .toBe(`4 sales waiting to sync · retrying (status_503) in 5s · Not syncing 2 orders: the store keeps failing (status_503) since ${time}`);
    cleanup();
    render(<SyncStatus state={{ pending: 3, sending: true, stuck: { commandIds: ['a'], since, reason: 'no_progress',
      orders: [{ commandId: 'a', since, reason: 'no_progress' }] } }} />);
    expect(screen.getByLabelText('Sync status').textContent)
      .toBe(`3 sales waiting to sync · sending · Not syncing 1 order: the store keeps failing (no_progress) since ${time}`);
  });
  it.each([['timeout', 'no answer from the store (timeout)'], ['status_503', 'the store keeps failing (status_503)']])(
    'shows a stuck %s with the matching wording', (reason, wording) => {
    const since = Date.now();
    const time = new Date(since).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    render(<SyncStatus state={{ pending: 1, sending: false,
      stuck: { commandIds: ['a'], since, reason, orders: [{ commandId: 'a', since, reason }] } }} />);
    expect(screen.getByLabelText('Sync status').textContent)
      .toBe(`1 sale waiting to sync · Not syncing 1 order: ${wording} since ${time}`);
  });

  it('shows the unchanged text without stuck', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    render(<SyncStatus state={{ pending: 2, sending: false, lastRetryReason: 'status_503', nextAttemptAt: now + 3000, stuck: undefined }} />);
    expect(screen.getByLabelText('Sync status').textContent).toBe('2 sales waiting to sync · retrying (status_503) in 3s');
  });

  const cashierLine = "Sales aren't reaching the online store. Keep selling: they're saved on this till and will send by themselves.";
  const detail = (plugin: string) => `The store didn't recognise this till. Ask the store owner to check that ${plugin} is installed `
    + "and switched on, and that the store address in this till's settings is right.";

  it('tells the cashier in plain words when the store keeps answering 404 (backendMissing), with a detail below', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    const state: OutboxState = { pending: 2, sending: false, lastRetryReason: 'status_404', nextAttemptAt: now + 3000 };
    render(<SyncStatus state={{ ...state, backendMissing: { since: now - 60_000 } }} />);
    expect(screen.getByLabelText('Sync status').textContent).toBe(`2 sales waiting to sync · ${cashierLine}`);
    expect(screen.getByText(detail('the POS plugin')).textContent).toBe(detail('the POS plugin'));
    cleanup();
    render(<SyncStatus state={{ ...state, backendMissing: { since: now - 60_000 } }} pluginName="Medusa POS" />);
    expect(screen.getByLabelText('Sync status').textContent).toBe(`2 sales waiting to sync · ${cashierLine}`);
    expect(screen.getByText(detail('Medusa POS')).textContent).toBe(detail('Medusa POS'));
    expect(screen.queryByText(/TallyUI|the POS plugin/)).toBeNull();
    cleanup();
    render(<SyncStatus state={state} />);
    expect(screen.getByLabelText('Sync status').textContent).toBe('2 sales waiting to sync · retrying (status_404) in 3s');
    expect(screen.queryByText(/store owner/)).toBeNull();
  });

  it('says the backend-missing sentence once, with "since {time}" once an order is stuck, and no raw code', () => {
    const since = new Date(2026, 8, 30, 2, 49, 10).getTime();
    const time = new Date(since).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const stuckLine = `Sales haven't reached the online store since ${time}. `
      + "Keep selling: they're saved on this till and will send by themselves.";
    const stuck = { commandIds: ['a', 'b'], since, reason: 'status_404',
      orders: ['a', 'b'].map((commandId) => ({ commandId, since, reason: 'status_404' })) };
    const state: OutboxState = { pending: 2, sending: false, lastRetryReason: 'status_404', backendMissing: { since } };
    render(<SyncStatus state={{ ...state, stuck }} />);
    const text = screen.getByLabelText('Sync status').textContent ?? '';
    expect(text.match(/Keep selling/g)).toHaveLength(1);
    expect(text).toBe(`2 sales waiting to sync · ${stuckLine}`);
    expect(text).not.toMatch(/status_404|Not syncing|aren't reaching/);
    cleanup();
    render(<SyncStatus state={state} />);
    expect(screen.getByLabelText('Sync status').textContent).toBe(`2 sales waiting to sync · ${cashierLine}`);  });

  it('formats the time with no forced leading zero on a 12-hour clock', () => {
    const time = new Date(2026, 8, 30, 2, 49, 10).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    expect(time).toMatch(/^2:49\sAM$/);
    expect(time).not.toMatch(/\b0\d:/);
  });

  const notice = (code: string, extra: Partial<SyncNotice> = {}): SyncNotice =>
    ({ code, since: Date.now(), fixedBy: code === 'unauthorized' ? 'till' : 'store', ...extra });
  const fallbackLine = "Products aren't updating.";
  const fallbackDetail = 'You can keep selling. Products, prices and stock stay as they were. '
    + 'Restart the app; if it keeps happening, tell the store owner.';

  it.each<[string, SyncNotice, string | undefined, string, string]>([
    ['unauthorized', notice('unauthorized'), undefined,
      "Products aren't updating: this till needs to sign in to the online store again.",
      'You can keep selling. Products, prices and stock stay as they were until someone signs in again.'],
    ['unsupported_store with software and minVersion', notice('unsupported_store', { software: 'ShopSoft', minVersion: '9.1' }), undefined,
      "Products aren't updating: the online store needs a software update.",
      'You can keep selling. Ask the store owner to update ShopSoft to version 9.1 or later.'],
    ['unsupported_store from WooCommerce', notice('unsupported_store', { software: 'WooCommerce', minVersion: '5.8' }), undefined,
      "Products aren't updating: the online store needs a software update.",
      'You can keep selling. Ask the store owner to update WooCommerce to version 5.8 or later.'],
    ['unsupported_store without them', notice('unsupported_store'), undefined,
      "Products aren't updating: the online store needs a software update.",
      "You can keep selling. Ask the store owner to update the store's software."],
    ['unsupported_store with only software', notice('unsupported_store', { software: 'ShopSoft' }), undefined,
      "Products aren't updating: the online store needs a software update.",
      "You can keep selling. Ask the store owner to update the store's software."],
    ['missing_plugin with the default pluginName', notice('missing_plugin'), undefined,
      "Products aren't updating: the online store is missing the POS plugin.",
      "You can keep selling. This till couldn't find the POS plugin on the online store. Ask the store owner to check that it is "
        + "installed and switched on, and that the store address in this till's settings is right."],
    ['missing_plugin with a custom pluginName', notice('missing_plugin'), 'WCPOS',
      "Products aren't updating: the online store is missing WCPOS.",
      "You can keep selling. This till couldn't find WCPOS on the online store. Ask the store owner to check that it is "
        + "installed and switched on, and that the store address in this till's settings is right."],
    ['store_misconfigured with a fix', notice('store_misconfigured', { fix: 'run the Vendure server with its time zone set to UTC' }), undefined,
      "Products aren't updating: a setting on the online store needs changing.",
      'You can keep selling. Ask the store owner to run the Vendure server with its time zone set to UTC.'],
    ['store_misconfigured without one', notice('store_misconfigured'), undefined,
      "Products aren't updating: a setting on the online store needs changing.",
      "You can keep selling. Ask the store owner to check the store's settings."],
    ['an unknown code', notice('some_new_code'), undefined, fallbackLine, fallbackDetail],
    ['an unknown till code', notice('some_till_code', { fixedBy: 'till' }), undefined, fallbackLine, fallbackDetail],
  ])('shows the pull notice for %s as a plain line and a detail, never the raw code', (_name, pullNotice, pluginName, line, detail) => {
    const { container } = render(<SyncStatus state={{ pending: 0, sending: false }} pullNotice={pullNotice} pluginName={pluginName} />);
    expect(screen.getByLabelText('Catalogue status').textContent).toBe(line);
    expect(screen.getByLabelText('Catalogue status detail').textContent).toBe(detail);
    expect(detail.startsWith('You can keep selling. ')).toBe(true);
    expect(screen.getByLabelText('Sync status').textContent).toBe('All sales synced');
    expect(container.textContent).not.toContain(pullNotice.code);
  });

  it('never names WooCommerce or 5.8 unless the notice does', () => {
    const { container } = render(<SyncStatus state={{ pending: 0, sending: false }}
      pullNotice={notice('unsupported_store', { software: 'ShopSoft', minVersion: '9.1' })} />);
    expect(container.textContent).not.toMatch(/WooCommerce|5\.8/);
    cleanup();
    const again = render(<SyncStatus state={{ pending: 0, sending: false }} pullNotice={notice('unsupported_store')} />);
    expect(again.container.textContent).not.toMatch(/WooCommerce|5\.8/);
  });


  it('shows no catalogue notice without pullNotice', () => {
    render(<SyncStatus state={{ pending: 0, sending: false }} />);
    expect(screen.queryByLabelText('Catalogue status')).toBeNull();
  });

  it('shows the catalogue notice first, then the outbox status, when both are set', () => {
    const { container } = render(<SyncStatus state={{ pending: 2, sending: false, backendMissing: { since: Date.now() } }}
      pullNotice={notice('unauthorized')} />);
    const text = container.textContent ?? '';
    const order = [screen.getByLabelText('Catalogue status').textContent!, screen.getByLabelText('Catalogue status detail').textContent!,
      screen.getByLabelText('Sync status').textContent!, detail('the POS plugin')].map((part) => text.indexOf(part));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
