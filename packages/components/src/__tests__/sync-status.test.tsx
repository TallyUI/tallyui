import { act, cleanup, render, screen } from '@testing-library/react';
import { AccessibilityInfo, Platform } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SyncNotice } from '@tallyui/core';
import type { OutboxState } from '@tallyui/pos';
import { SyncStatus } from '../sale/sync-status';

const os = Platform.OS;
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); Object.assign(Platform, { OS: os }); });

// The status line as shown: its live region (the only labelled element), whose text is exactly its label and never sending,
// retrying or a countdown; then, after a newline, the short sending or retrying line below it, if any, which has neither.
function line() {
  const live = document.querySelector('[aria-label]');
  expect(live?.getAttribute('aria-label')).toBe(live?.textContent);
  expect(live?.getAttribute('aria-live')).toBe('polite');
  expect(live?.textContent).not.toMatch(/sending|retrying| in \d/i);
  const next = live?.nextElementSibling;
  if (!next?.textContent?.match(/^(Sending|Retrying)/)) return live?.textContent;
  expect([next.getAttribute('aria-live'), next.getAttribute('aria-label')]).toEqual([null, null]);
  return `${live?.textContent}\n${next.textContent}`;
}
const label = () => document.querySelector('[aria-label]')?.getAttribute('aria-label');

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
    expect(line()).toBe('2 sales waiting to sync\nSending…');
  });
  it('appends "retrying" and a countdown to the next attempt when not sending, with no reason code', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    const state: OutboxState = { pending: 1, sending: false, lastRetryReason: 'offline', nextAttemptAt: now + 5000 };
    render(<SyncStatus state={state} />);
    expect(line()).toBe('1 sale waiting to sync\nRetrying in 5 s.');
    expect(label()).toBe('1 sale waiting to sync');
  });
  // #263's "since" sentence, which a stuck order shows with the store missing or not, for any reason.
  const salesSince = (time: string) => `Sales haven't reached the online store since ${time}. `
    + "Keep selling: they're saved on this till and will send by themselves.";
  it('says since when sales have not reached the store once orders are stuck, with sending or retrying after it', () => {
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
    // Sending or retrying comes last, outside the live region.
    expect(line()).toBe(`4 sales waiting to sync · ${salesSince(time)}\nRetrying in 5 s.`);
    expect(label()).toBe(`4 sales waiting to sync · ${salesSince(time)}`);
    cleanup();
    render(<SyncStatus state={{ pending: 3, sending: true, stuck: { commandIds: ['a'], since, reason: 'no_progress',
      orders: [{ commandId: 'a', since, reason: 'no_progress' }] } }} />);
    expect(line()).toBe(`3 sales waiting to sync · ${salesSince(time)}\nSending…`);
    expect(label()).toBe(`3 sales waiting to sync · ${salesSince(time)}`);
  });
  it.each(['timeout', 'status_503'])('shows a stuck %s with the same words, and no "Not syncing" or per-reason wording', (reason) => {
    const since = Date.now();
    const time = new Date(since).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const { container } = render(<SyncStatus state={{ pending: 1, sending: false,
      stuck: { commandIds: ['a'], since, reason, orders: [{ commandId: 'a', since, reason }] } }} />);
    expect(line()).toBe(`1 sale waiting to sync · ${salesSince(time)}`);
    expect(container.textContent).not.toMatch(/Not syncing|keeps failing|no answer from the store/);
  });
  it('with only till updates waiting and stuck, the store not missing, says since when till updates have not reached the store', () => {
    const since = new Date(2026, 8, 30, 2, 49, 10).getTime();
    const time = new Date(since).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    render(<SyncStatus state={{ pending: 0, sending: false }} registerState={{ pending: 1, sending: true,
      stuck: { commandIds: ['r'], since, reason: 'status_503', orders: [{ commandId: 'r', since, reason: 'status_503' }] } }} />);
    const tillSince = `1 till update waiting to sync · Till updates haven't reached the online store since ${time}. `
      + "Keep selling: they're saved on this till and will send by themselves.";
    expect(line()).toBe(`${tillSince}\nSending…`);
    expect(label()).toBe(tillSince);
  });

  it('shows the unchanged text without stuck', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    render(<SyncStatus state={{ pending: 2, sending: false, lastRetryReason: 'status_503', nextAttemptAt: now + 3000, stuck: undefined }} />);
    expect(line()).toBe('2 sales waiting to sync\nRetrying in 3 s.');
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
    expect(line()).toBe('2 sales waiting to sync\nRetrying in 3 s.');
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

  // #269's ruled lines and detail, written out whole.
  const refusedOne = "1 sale needs attention · The online store refused it. Ask the store owner to look at the till's sync log.";
  const refusedMany = (n: number) => `${n} sales need attention · The online store refused them. Ask the store owner to look at the till's sync log.`;
  // The line with what else waits after the refused count: `counts` replaces "{n} sale(s) need(s) attention".
  const refusedWaiting = (counts: string, them = 'them') => `${counts} · The online store refused ${them}. Ask the store owner to look at the till's sync log.`;
  const refusedDetail = 'Refused sales stay on this till under Needs attention, each with what to do next.';
  // Every text shown below the status line, in order.
  const below = () => {
    const texts: (string | null)[] = [];
    for (let el = document.querySelector('[aria-label]')?.nextElementSibling; el; el = el.nextElementSibling) texts.push(el.textContent);
    return texts;
  };

  it('with refused sales, says "1 sale needs attention" or "3 sales need attention", labelled so, with the detail below', () => {
    const { container } = render(<SyncStatus state={{ pending: 0, sending: false, rejected: 1 }} />);
    expect(line()).toBe(refusedOne);
    expect(label()).toBe(refusedOne);
    expect(below()).toEqual([refusedDetail]);
    expect(container.textContent).not.toMatch(/up to date/);
    cleanup();
    render(<SyncStatus state={{ pending: 0, sending: false, rejected: 3 }} registerState={{ pending: 0, sending: false }} />);
    expect(line()).toBe(refusedMany(3));
    expect(label()).toBe(refusedMany(3));
    expect(below()).toEqual([refusedDetail]);
  });

  it('with refused sales and others waiting, names both in the refused line, written out whole', () => {
    render(<SyncStatus state={{ pending: 5, sending: false, rejected: 1 }} />);
    expect(line()).toBe("1 sale needs attention, 5 waiting to sync · The online store refused it. Ask the store owner to look at the till's sync log.");
    expect(label()).toBe("1 sale needs attention, 5 waiting to sync · The online store refused it. Ask the store owner to look at the till's sync log.");
    cleanup();
    render(<SyncStatus state={{ pending: 1, sending: false, rejected: 2 }} />);
    expect(line()).toBe("2 sales need attention, 1 waiting to sync · The online store refused them. Ask the store owner to look at the till's sync log.");
    cleanup();
    render(<SyncStatus state={{ pending: 0, sending: false, rejected: 1 }} registerState={{ pending: 2, sending: false }} />);
    expect(line()).toBe("1 sale needs attention, 2 till updates waiting to sync · The online store refused it. Ask the store owner to look at the till's sync log.");
  });

  it('with rejected: 2, shows the refused line with the waiting counts over a stuck order, sending and retrying', () => {
    const since = Date.now();
    const stuck = { commandIds: ['a'], since, reason: 'status_503', orders: [{ commandId: 'a', since, reason: 'status_503' }] };
    for (const sending of [true, false]) {
      const { container } = render(<SyncStatus state={{ pending: 4, sending, rejected: 2, stuck, lastRetryReason: 'status_503',
        nextAttemptAt: since + 5000 }} registerState={{ pending: 2, sending, stuck, lastRetryReason: 'status_503', nextAttemptAt: since + 5000 }} />);
      expect(line()).toBe(refusedWaiting('2 sales need attention, 4 sales and 2 till updates waiting to sync'));
      expect(below()).toEqual([refusedDetail]);
      expect(container.textContent).not.toMatch(/haven't reached|Sending|Retrying|up to date/);
      cleanup();
    }
  });

  it('with refused sales and the store missing, shows the refused detail first, then the backend-missing detail', () => {
    const backendMissing = { since: Date.now() };
    render(<SyncStatus state={{ pending: 0, sending: false, rejected: 1, backendMissing }} />);
    expect(line()).toBe(refusedOne);
    expect(below()).toEqual([refusedDetail, "This till couldn't find the POS plugin on the online store the last time it checked. "
      + "Ask the store owner to check that it is installed and switched on, and that the store address in this till's settings is right."]);
    cleanup();
    render(<SyncStatus state={{ pending: 3, sending: true, rejected: 2, backendMissing }} pluginName="Medusa POS" />);
    expect(line()).toBe(refusedWaiting('2 sales need attention, 3 waiting to sync'));
    expect(below()).toEqual([refusedDetail, detail('Medusa POS')]);
  });

  it('with rejected: 0 and nothing pending, says "Sales are up to date." with no refused detail', () => {
    const { container } = render(<SyncStatus state={{ pending: 0, sending: false, rejected: 0 }} />);
    expect(line()).toBe('Sales are up to date.');
    expect(below()).toEqual([]);
    expect(container.textContent).not.toMatch(/attention|refused/i);
  });

  it('on iOS, announces the refused line once per change, and nothing as sending flips', () => {
    Object.assign(Platform, { OS: 'ios' });
    const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const { rerender } = render(<SyncStatus state={{ pending: 1, sending: false }} />);
    rerender(<SyncStatus state={{ pending: 1, sending: false, rejected: 1 }} />);
    rerender(<SyncStatus state={{ pending: 1, sending: true, rejected: 1 }} />);
    rerender(<SyncStatus state={{ pending: 0, sending: false, rejected: 2 }} />);
    expect(announce.mock.calls).toEqual([[refusedWaiting('1 sale needs attention, 1 waiting to sync', 'it')], [refusedMany(2)]]);
  });

  const batchRefused = (waiting: string) => `${waiting} waiting to sync · The online store refused the last send. `
    + 'This till will try again with the next sale, or when the app is reopened.';
  // The till-updates line promises nothing about reopening: no app starts the register outbox at launch.
  const tillUpdatesRefused = {
    2: '2 till updates waiting to sync · The online store refused the last send. This till will try again with the next till update.',
    1: '1 till update waiting to sync · The online store refused the last send. This till will try again with the next till update.',
  };
  it('with a refused batch (sales, or till updates alone), says so after the waiting count, over the stuck and missing sentences, with no Sending or Retrying line', () => {
    const since = Date.now();
    const stuck = { commandIds: ['a'], since, reason: 'status_503', orders: [{ commandId: 'a', since, reason: 'status_503' }] };
    const refused = { status: 413, reason: 'status_413' };
    const cases: [OutboxState, OutboxState | undefined, string][] = [
      [{ pending: 3, sending: false, refused, lastRetryReason: 'refused' }, undefined, batchRefused('3 sales')],
      [{ pending: 1, sending: false, refused, lastRetryReason: 'refused' }, undefined, batchRefused('1 sale')],
      [{ pending: 1, sending: true, refused, lastRetryReason: 'refused', stuck, backendMissing: { since } },
        { pending: 2, sending: false }, batchRefused('1 sale and 2 till updates')],
      [{ pending: 0, sending: false }, { pending: 2, sending: false, refused, lastRetryReason: 'refused' },
        tillUpdatesRefused[2]],
      [{ pending: 0, sending: false }, { pending: 1, sending: false, refused, lastRetryReason: 'refused' },
        tillUpdatesRefused[1]],
      // Both refused with a sale waiting: the sales line wins.
      [{ pending: 2, sending: false, refused, lastRetryReason: 'refused' }, { pending: 1, sending: false, refused,
        lastRetryReason: 'refused' }, batchRefused('2 sales and 1 till update')]];
    for (const [state, registerState, text] of cases) {
      const { container } = render(<SyncStatus state={state} registerState={registerState} />);
      expect(line()).toBe(text);
      expect(label()).toBe(text);
      expect(container.textContent).not.toMatch(/Sending|Retrying|haven't reached|aren't reaching/);
      cleanup();
    }
    render(<SyncStatus state={{ pending: 3, sending: false, refused, lastRetryReason: 'refused', rejected: 1 }} />);
    expect(line()).toBe(refusedWaiting('1 sale needs attention, 3 waiting to sync', 'it'));
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

  it('inserts a plugin name holding $&, $$ and $1 literally', () => {
    render(<SyncStatus state={{ pending: 1, sending: false, backendMissing: { since: Date.now() } }} pluginName="Shop $& $$ $1" />);
    const text = "This till couldn't find Shop $& $$ $1 on the online store. Ask the store owner to check that it is installed "
      + "and switched on, and that the store address in this till's settings is right.";
    expect(screen.getByText(text).textContent).toBe(text);
  });

  it('makes the status line, and not the detail line, a polite live region', () => {
    render(<SyncStatus state={{ pending: 1, sending: false, backendMissing: { since: Date.now() } }} />);
    expect(document.querySelector('[aria-label]')?.getAttribute('aria-live')).toBe('polite');
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);
    expect(screen.getByText(detail('the POS plugin')).getAttribute('aria-live')).toBeNull();
  });

  it('with only till updates waiting, takes the sending text from the register outbox, not the order outbox', () => {
    render(<SyncStatus state={{ pending: 0, sending: false }} registerState={{ pending: 1, sending: true }} />);
    expect(line()).toBe('1 till update waiting to sync\nSending…');
    cleanup();
    render(<SyncStatus state={{ pending: 0, sending: true }} registerState={{ pending: 1, sending: false }} />);
    expect(line()).toBe('1 till update waiting to sync');
    cleanup();
    // A sale waits: the order outbox's text, as before.
    render(<SyncStatus state={{ pending: 1, sending: false }} registerState={{ pending: 1, sending: true }} />);
    expect(line()).toBe('1 sale and 1 till update waiting to sync');
  });

  it('with only till updates waiting, shows the register outbox retrying and counts down to its next attempt', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    render(<SyncStatus state={{ pending: 0, sending: false }}
      registerState={{ pending: 1, sending: false, lastRetryReason: 'status_503', nextAttemptAt: now + 5000 }} />);
    expect(line()).toBe('1 till update waiting to sync\nRetrying in 5 s.');
    act(() => { vi.advanceTimersByTime(2000); });
    expect(line()).toBe('1 till update waiting to sync\nRetrying in 3 s.');
  });

  it('on iOS, announces only the substance: nothing as sending or retrying flips or the countdown ticks; the screen keeps them', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    Object.assign(Platform, { OS: 'ios' });
    const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const { rerender } = render(<SyncStatus state={{ pending: 0, sending: false }} />);
    rerender(<SyncStatus state={{ pending: 1, sending: true }} />);
    expect(announce.mock.calls).toEqual([['1 sale waiting to sync']]);
    expect(line()).toBe('1 sale waiting to sync\nSending…');
    // Sending, then retrying, is a short line of its own below the live region, which holds only the spoken line.
    const live = document.querySelector('[aria-live]')!;
    expect([live.textContent, live.nextElementSibling?.textContent]).toEqual(['1 sale waiting to sync', 'Sending…']);
    rerender(<SyncStatus state={{ pending: 1, sending: false, lastRetryReason: 'status_503', nextAttemptAt: now + 5000 }} />);
    expect(line()).toBe('1 sale waiting to sync\nRetrying in 5 s.');
    const doing = live.nextElementSibling!;
    expect(doing.textContent).toBe('Retrying in 5 s.');
    act(() => { vi.advanceTimersByTime(3000); });
    expect(line()).toBe('1 sale waiting to sync\nRetrying in 2 s.');
    expect(document.querySelector('[aria-live]')).toBe(live);
    expect([live.textContent, doing.textContent]).toEqual(['1 sale waiting to sync', 'Retrying in 2 s.']);
    rerender(<SyncStatus state={{ pending: 1, sending: true }} />);
    expect(line()).toBe('1 sale waiting to sync\nSending…');
    expect(label()).toBe('1 sale waiting to sync');
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('shows retrying as its own short line below the status line, "Retrying in 5 s." then "Retrying in 2 s." after the tick', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    const { container } = render(<SyncStatus state={{ pending: 1, sending: false, lastRetryReason: 'offline', nextAttemptAt: now + 5000 }}
      pullNotice={notice('unauthorized')} />);
    const short = screen.getByText('Retrying in 5 s.');
    act(() => { vi.advanceTimersByTime(3000); });
    expect(short.textContent).toBe('Retrying in 2 s.');
    // The pull-notice line (and its detail), then the status line, then the short line.
    const lines = Array.from(container.querySelectorAll('[dir]')).map((element) => element.textContent);
    expect(lines).toEqual(["Products aren't updating: this till needs to sign in to the online store again.",
      'You can keep selling. Products, prices and stock stay as they were until someone signs in again.',
      '1 sale waiting to sync', 'Retrying in 2 s.']);
  });

  it('never renders " · " after a full stop', () => {
    const since = Date.now();
    const stuck = { commandIds: ['a'], since, reason: 'status_503', orders: [{ commandId: 'a', since, reason: 'status_503' }] };
    const cases: [OutboxState, OutboxState?][] = [
      [{ pending: 2, sending: false, lastRetryReason: 'status_503', nextAttemptAt: since + 5000, stuck }],
      [{ pending: 2, sending: true, stuck }], [{ pending: 2, sending: false, backendMissing: { since }, stuck }],
      [{ pending: 0, sending: false }, { pending: 1, sending: true, stuck }]];
    for (const [state, registerState] of cases) {
      const { container } = render(<SyncStatus state={state} registerState={registerState} pullNotice={notice('missing_plugin')} />);
      expect(container.textContent).toMatch(/haven't reached the online store since/);
      for (const element of Array.from(container.querySelectorAll('*'))) expect(element.textContent).not.toContain('. ·');
      cleanup();
    }
  });

  it('never shows or announces a reason code (status_… or one in parentheses)', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    Object.assign(Platform, { OS: 'ios' });
    const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const stuck = (reason: string) => ({ commandIds: ['a'], since: now, reason, orders: [{ commandId: 'a', since: now, reason }] });
    const retry = (reason: string) => ({ lastRetryReason: reason, nextAttemptAt: now + 5000 });
    const cases: [OutboxState, OutboxState?][] = [
      [{ pending: 1, sending: false, ...retry('status_503') }], [{ pending: 1, sending: false, ...retry('offline') }],
      [{ pending: 2, sending: false, ...retry('status_503'), stuck: stuck('status_503') }],
      [{ pending: 1, sending: false, stuck: stuck('timeout') }], [{ pending: 1, sending: true, stuck: stuck('no_progress') }],
      [{ pending: 0, sending: false }, { pending: 1, sending: false, ...retry('status_503') }]];
    for (const [state, registerState] of cases) {
      const { container, rerender } = render(<SyncStatus state={{ pending: 0, sending: false }} />);
      rerender(<SyncStatus state={state} registerState={registerState} />);
      for (const said of [container.textContent, label(), ...announce.mock.calls.map(([text]) => text)]) {
        expect(said).not.toMatch(/status_|\([^)]*\)/);
      }
      cleanup();
    }
    expect(announce).toHaveBeenCalledTimes(cases.length);
  });

  it('on iOS, announces the status line once per change of its text, with the new line, and not on the first mount', () => {
    Object.assign(Platform, { OS: 'ios' });
    const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const { rerender } = render(<SyncStatus state={{ pending: 0, sending: false }} />);
    expect(announce).not.toHaveBeenCalled();
    rerender(<SyncStatus state={{ pending: 1, sending: true }} />);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('1 sale waiting to sync');
    // A re-render with the same text announces nothing.
    rerender(<SyncStatus state={{ pending: 1, sending: true }} />);
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('on iOS, announces the pull-notice line and the status line in ONE call when both change in the same render', () => {
    Object.assign(Platform, { OS: 'ios' });
    const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const { rerender } = render(<SyncStatus state={{ pending: 0, sending: false }} />);
    rerender(<SyncStatus state={{ pending: 2, sending: false }} pullNotice={notice('unauthorized')} />);
    expect(announce.mock.calls).toEqual([
      ["Products aren't updating: this till needs to sign in to the online store again. 2 sales waiting to sync"]]);
    // Only one changes: that one alone.
    rerender(<SyncStatus state={{ pending: 3, sending: false }} pullNotice={notice('unauthorized')} />);
    expect(announce.mock.calls[1]).toEqual(['3 sales waiting to sync']);
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it.each(['web', 'android'])('on %s, announces nothing: the live region is enough', (platform) => {
    Object.assign(Platform, { OS: platform });
    const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const { rerender } = render(<SyncStatus state={{ pending: 0, sending: false }} />);
    rerender(<SyncStatus state={{ pending: 1, sending: true }} />);
    expect(line()).toBe('1 sale waiting to sync\nSending…');
    expect(announce).not.toHaveBeenCalled();
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
    ['till_update_required', notice('till_update_required', { fixedBy: 'till' }), undefined,
      "Products aren't updating: this till needs updating.",
      'You can keep selling. Products, prices and stock stay as they were until this till is updated.'],
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

  it.each<[string, string]>([
    ['unauthorized', "Products aren't updating: this till needs to sign in to the online store again."],
    ['unsupported_store', "Products aren't updating: the online store needs a software update."],
    ['missing_plugin', "Products aren't updating: the online store is missing the POS plugin."],
    ['store_misconfigured', "Products aren't updating: a setting on the online store needs changing."],
    ['some_new_code', fallbackLine],
  ])('makes the %s pull-notice line a polite live region, announced on iOS once per change and not on the first mount', (code, noticeLine) => {
    Object.assign(Platform, { OS: 'ios' });
    const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const idle: OutboxState = { pending: 0, sending: false };
    const first = render(<SyncStatus state={idle} pullNotice={notice(code)} />);
    expect(announce).not.toHaveBeenCalled();
    first.unmount();
    const { rerender } = render(<SyncStatus state={idle} />);
    rerender(<SyncStatus state={idle} pullNotice={notice(code)} />);
    expect(announce.mock.calls).toEqual([[noticeLine]]);
    expect(screen.getByText(noticeLine).getAttribute('aria-live')).toBe('polite');
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(2);
    rerender(<SyncStatus state={idle} pullNotice={notice(code)} />);
    expect(announce).toHaveBeenCalledTimes(1);
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
