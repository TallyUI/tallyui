import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SyncNotice } from '@tallyui/core';
import type { OutboxState } from '@tallyui/pos';
import { SyncStatus } from '../sale/sync-status';

afterEach(() => { cleanup(); vi.useRealTimers(); });

// The status line's text, checking on the way that its accessibility label (the only one rendered) is that same text.
function line() {
  const element = document.querySelector('[aria-label]');
  expect(element?.getAttribute('aria-label')).toBe(element?.textContent);
  return element?.textContent;
}

describe('SyncStatus', () => {
  it('shows "Sales are up to date." when nothing is pending', () => {
    render(<SyncStatus state={{ pending: 0, sending: false }} />);
    expect(line()).toBe('Sales are up to date.');
  });
  it('pluralizes a single pending sale', () => {
    render(<SyncStatus state={{ pending: 1, sending: false }} />);
    expect(line()).toBe('1 sale waiting to sync');
  });
  it('pluralizes several pending sales', () => {
    render(<SyncStatus state={{ pending: 3, sending: false }} />);
    expect(line()).toBe('3 sales waiting to sync');
  });
  it('appends "sending" while a flush is in flight', () => {
    render(<SyncStatus state={{ pending: 2, sending: true }} />);
    expect(line()).toBe('2 sales waiting to sync · sending');
  });
  it('appends the retry reason and a countdown to the next attempt when not sending', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    const state: OutboxState = { pending: 1, sending: false, lastRetryReason: 'offline', nextAttemptAt: now + 5000 };
    render(<SyncStatus state={state} />);
    expect(line()).toBe('1 sale waiting to sync · retrying (offline) in 5s');
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
    expect(line())
      .toBe(`4 sales waiting to sync · retrying (status_503) in 5s · Not syncing 2 orders: the store keeps failing (status_503) since ${time}`);
    cleanup();
    render(<SyncStatus state={{ pending: 3, sending: true, stuck: { commandIds: ['a'], since, reason: 'no_progress',
      orders: [{ commandId: 'a', since, reason: 'no_progress' }] } }} />);
    expect(line())
      .toBe(`3 sales waiting to sync · sending · Not syncing 1 order: the store keeps failing (no_progress) since ${time}`);
  });
  it.each([['timeout', 'no answer from the store (timeout)'], ['status_503', 'the store keeps failing (status_503)']])(
    'shows a stuck %s with the matching wording', (reason, wording) => {
    const since = Date.now();
    const time = new Date(since).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    render(<SyncStatus state={{ pending: 1, sending: false,
      stuck: { commandIds: ['a'], since, reason, orders: [{ commandId: 'a', since, reason }] } }} />);
    expect(line())
      .toBe(`1 sale waiting to sync · Not syncing 1 order: ${wording} since ${time}`);
  });

  it('shows the unchanged text without stuck', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    render(<SyncStatus state={{ pending: 2, sending: false, lastRetryReason: 'status_503', nextAttemptAt: now + 3000, stuck: undefined }} />);
    expect(line()).toBe('2 sales waiting to sync · retrying (status_503) in 3s');
  });

  const cashierLine = "Sales aren't reaching the online store. Keep selling: they're saved on this till and will send by themselves.";
  // Written out whole, with and without pluginName, so the exact wording is pinned.
  const details: Record<string, string> = {
    'the POS plugin': "This till couldn't find the POS plugin on the online store. Ask the store owner to check that it is installed and switched on, and that the store address in this till's settings is right.",
    'Medusa POS': "This till couldn't find Medusa POS on the online store. Ask the store owner to check that it is installed and switched on, and that the store address in this till's settings is right.",
  };
  const detail = (plugin: string) => details[plugin]!;
  const tillLine = "Till updates aren't reaching the online store. Keep selling: they're saved on this till and will send by themselves.";

  it('tells the cashier in plain words when the store keeps answering 404 (backendMissing), with a detail below', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    const state: OutboxState = { pending: 2, sending: false, lastRetryReason: 'status_404', nextAttemptAt: now + 3000 };
    render(<SyncStatus state={{ ...state, backendMissing: { since: now - 60_000 } }} />);
    expect(line()).toBe(`2 sales waiting to sync · ${cashierLine}`);
    expect(screen.getByText(detail('the POS plugin')).textContent).toBe(detail('the POS plugin'));
    cleanup();
    render(<SyncStatus state={{ ...state, backendMissing: { since: now - 60_000 } }} pluginName="Medusa POS" />);
    expect(line()).toBe(`2 sales waiting to sync · ${cashierLine}`);
    expect(screen.getByText(detail('Medusa POS')).textContent).toBe(detail('Medusa POS'));
    expect(screen.queryByText(/TallyUI|the POS plugin/)).toBeNull();
    cleanup();
    render(<SyncStatus state={state} />);
    expect(line()).toBe('2 sales waiting to sync · retrying (status_404) in 3s');
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
    const text = line() ?? '';
    expect(text.match(/Keep selling/g)).toHaveLength(1);
    expect(text).toBe(`2 sales waiting to sync · ${stuckLine}`);
    expect(text).not.toMatch(/status_404|Not syncing|aren't reaching/);
    cleanup();
    render(<SyncStatus state={state} />);
    expect(line()).toBe(`2 sales waiting to sync · ${cashierLine}`);  });

  it.each([[1, `1 till update waiting to sync · ${tillLine}`], [3, `3 till updates waiting to sync · ${tillLine}`]])(
    'with no sale waiting, names %i waiting till update(s) and says till updates are not reaching the store', (pending, text) => {
    const backendMissing = { since: Date.now() };
    render(<SyncStatus state={{ pending: 0, sending: false, backendMissing }} registerState={{ pending, sending: false, backendMissing }} />);
    expect(line()).toBe(text);
    expect(screen.getByText(detail('the POS plugin'))).toBeTruthy();
    cleanup();
    // The register outbox alone (its own tracker) sets it: the notice and the detail still show.
    render(<SyncStatus state={{ pending: 0, sending: false }} registerState={{ pending, sending: false, backendMissing }} />);
    expect(line()).toBe(text);
    expect(screen.getByText(detail('the POS plugin'))).toBeTruthy();
  });

  it('with sales and till updates waiting, names both and the sales sentence wins, plain and "since"', () => {
    const since = new Date(2026, 8, 30, 2, 49, 10).getTime();
    const time = new Date(since).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const backendMissing = { since };
    const registerState: OutboxState = { pending: 1, sending: false, backendMissing };
    render(<SyncStatus state={{ pending: 2, sending: false, backendMissing }} registerState={registerState} />);
    expect(line()).toBe(`2 sales and 1 till update waiting to sync · ${cashierLine}`);
    cleanup();
    // Both stuck (the till updates an hour earlier): the sales "since" sentence wins, with the sales time.
    const stuck = (at: number) => ({ commandIds: ['a'], since: at, reason: 'status_404', orders: [{ commandId: 'a', since: at, reason: 'status_404' }] });
    render(<SyncStatus state={{ pending: 1, sending: false, backendMissing, stuck: stuck(since) }}
      registerState={{ ...registerState, pending: 4, stuck: stuck(since - 3_600_000) }} />);
    expect(line()).toBe(`1 sale and 4 till updates waiting to sync · Sales haven't reached the online store since ${time}. `
      + "Keep selling: they're saved on this till and will send by themselves.");
  });

  it('with only till updates waiting and registerState.stuck set, says since when till updates have not reached the store', () => {
    const since = new Date(2026, 8, 30, 2, 49, 10).getTime();
    const time = new Date(since).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const backendMissing = { since };
    render(<SyncStatus state={{ pending: 0, sending: false, backendMissing }} registerState={{ pending: 1, sending: false, backendMissing,
      stuck: { commandIds: ['r'], since, reason: 'status_404', orders: [{ commandId: 'r', since, reason: 'status_404' }] } }} />);
    expect(line()).toBe(`1 till update waiting to sync · Till updates haven't reached the online store since ${time}. `
      + "Keep selling: they're saved on this till and will send by themselves.");
  });

  it('with nothing waiting but the store missing, says only "Sales are up to date." and the store was missing when last checked', () => {
    const lastChecked = (plugin: string) => `This till couldn't find ${plugin} on the online store the last time it checked. `
      + "Ask the store owner to check that it is installed and switched on, and that the store address in this till's settings is right.";
    expect(lastChecked('the POS plugin')).toBe("This till couldn't find the POS plugin on the online store the last time it checked. Ask the store owner to check that it is installed and switched on, and that the store address in this till's settings is right.");
    const backendMissing = { since: Date.now() };
    render(<SyncStatus state={{ pending: 0, sending: true, lastRetryReason: 'status_404', nextAttemptAt: Date.now() + 3000, backendMissing }}
      registerState={{ pending: 0, sending: false, backendMissing }} />);
    expect(line()).toBe('Sales are up to date.');
    expect(screen.getByLabelText('Sales are up to date.').textContent).toBe('Sales are up to date.');
    expect(screen.getByText(lastChecked('the POS plugin')).textContent).toBe(lastChecked('the POS plugin'));
    expect(screen.queryByText(/synced|aren't reaching/)).toBeNull();
    cleanup();
    render(<SyncStatus state={{ pending: 0, sending: false, backendMissing }} pluginName="Medusa POS" />);
    expect(line()).toBe('Sales are up to date.');
    expect(screen.getByText(lastChecked('Medusa POS')).textContent).toBe(lastChecked('Medusa POS'));
  });

  it('with nothing waiting and the store not missing, says exactly "Sales are up to date." with no detail line', () => {
    render(<SyncStatus state={{ pending: 0, sending: false }} registerState={{ pending: 0, sending: false }} />);
    expect(line()).toBe('Sales are up to date.');
    expect(screen.queryByText(/store owner/)).toBeNull();
    cleanup();
    // Nothing after it either: no sending or retrying text.
    render(<SyncStatus state={{ pending: 0, sending: true, lastRetryReason: 'status_503', nextAttemptAt: Date.now() + 3000 }} />);
    expect(line()).toBe('Sales are up to date.');
    expect(screen.queryByText(/store owner|synced/)).toBeNull();
  });

  it('never says "Sales are up to date." while a sale or a till update waits', () => {
    const waiting: [OutboxState, OutboxState, string][] = [
      [{ pending: 0, sending: false }, { pending: 2, sending: false }, '2 till updates waiting to sync'],
      [{ pending: 1, sending: false }, { pending: 0, sending: false }, '1 sale waiting to sync'],
      [{ pending: 1, sending: false }, { pending: 1, sending: false }, '1 sale and 1 till update waiting to sync']];
    for (const [state, registerState, text] of waiting) {
      render(<SyncStatus state={state} registerState={registerState} />);
      expect(line()).toBe(text);
      expect(screen.queryByText(/up to date|synced/)).toBeNull();
      cleanup();
    }
    render(<SyncStatus state={{ pending: 0, sending: false }} registerState={{ pending: 0, sending: false }} />);
    expect(line()).toBe('Sales are up to date.');
  });

  it('labels the status line with exactly the line shown, idle and with the store missing', () => {
    render(<SyncStatus state={{ pending: 0, sending: false }} />);
    expect(screen.getByLabelText('Sales are up to date.').textContent).toBe('Sales are up to date.');
    cleanup();
    render(<SyncStatus state={{ pending: 2, sending: false, backendMissing: { since: Date.now() } }} />);
    const shown = `2 sales waiting to sync · ${cashierLine}`;
    expect(screen.getByLabelText(shown).textContent).toBe(shown);
    expect(screen.queryByLabelText('Sync status')).toBeNull();
  });

  it('formats the time with no forced leading zero on a 12-hour clock', () => {
    const time = new Date(2026, 8, 30, 2, 49, 10).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    expect(time).toMatch(/^2:49\sAM$/);
    expect(time).not.toMatch(/\b0\d:/);
  });

  // The pull notice: its own line and detail above the outbox line, found by their exact text (they carry no label).
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
  ])('shows the pull notice for %s as a plain line and a detail, never the raw code', (_name, pullNotice, pluginName, noticeLine, noticeDetail) => {
    const { container } = render(<SyncStatus state={{ pending: 0, sending: false }} pullNotice={pullNotice} pluginName={pluginName} />);
    expect(screen.getByText(noticeLine).textContent).toBe(noticeLine);
    expect(screen.getByText(noticeDetail).textContent).toBe(noticeDetail);
    expect(noticeDetail.startsWith('You can keep selling. ')).toBe(true);
    expect(line()).toBe('Sales are up to date.');
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

  it('shows no pull notice without pullNotice', () => {
    render(<SyncStatus state={{ pending: 0, sending: false }} />);
    expect(screen.queryByText(/Products aren't updating|You can keep selling/)).toBeNull();
  });

  it('shows the pull notice first, then the outbox line and its detail, when both are set', () => {
    const { container } = render(<SyncStatus state={{ pending: 2, sending: false, backendMissing: { since: Date.now() } }}
      pullNotice={notice('unauthorized')} />);
    const text = container.textContent ?? '';
    const order = ["Products aren't updating: this till needs to sign in to the online store again.",
      'You can keep selling. Products, prices and stock stay as they were until someone signs in again.',
      `2 sales waiting to sync · ${cashierLine}`, detail('the POS plugin')].map((part) => text.indexOf(part));
    expect(line()).toBe(`2 sales waiting to sync · ${cashierLine}`);
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('with missing_plugin and the store missing, shows both lines and the missing-plugin detail once, below both', () => {
    const productsLine = "Products aren't updating: the online store is missing WCPOS.";
    const pluginDetail = "You can keep selling. This till couldn't find WCPOS on the online store. Ask the store owner to check that it is "
      + "installed and switched on, and that the store address in this till's settings is right.";
    const outboxDetail = (lastTime: string) => `This till couldn't find WCPOS on the online store${lastTime}. Ask the store owner to check that it is `
      + "installed and switched on, and that the store address in this till's settings is right.";
    const backendMissing = { since: Date.now() };
    const cases: [OutboxState, OutboxState | undefined, string, string][] = [
      [{ pending: 2, sending: false, backendMissing }, undefined, `2 sales waiting to sync · ${cashierLine}`, ''],
      [{ pending: 0, sending: false, backendMissing }, undefined, 'Sales are up to date.', ' the last time it checked'],
      // The register outbox alone (its own tracker) sets it: the same one detail.
      [{ pending: 0, sending: false }, { pending: 1, sending: false, backendMissing }, `1 till update waiting to sync · ${tillLine}`, ''],
    ];
    for (const [state, registerState, salesLine, lastTime] of cases) {
      const { container } = render(<SyncStatus state={state} registerState={registerState} pluginName="WCPOS"
        pullNotice={notice('missing_plugin')} />);
      const text = container.textContent ?? '';
      expect(line()).toBe(salesLine);
      expect(screen.getByText(productsLine)).toBeTruthy();
      expect(screen.getByText(pluginDetail)).toBeTruthy();
      expect(text.match(/couldn't find WCPOS/g)).toHaveLength(1);
      expect(screen.queryByText(outboxDetail(lastTime))).toBeNull();
      const order = [productsLine, salesLine, pluginDetail].map((part) => text.indexOf(part));
      expect(order.every((at) => at >= 0)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      cleanup();
    }
    // Without backendMissing the missing-plugin notice keeps its detail under its own line, as before.
    render(<SyncStatus state={{ pending: 0, sending: false }} pluginName="WCPOS" pullNotice={notice('missing_plugin')} />);
    expect(screen.getByText(pluginDetail)).toBeTruthy();
    expect(screen.queryByText(outboxDetail(''))).toBeNull();
  });
});
