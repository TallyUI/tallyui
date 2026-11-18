import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError, CustomerServiceError, type Customer } from '@tallyui/core';
import { PortalHost } from '@tallyui/primitives';
import { CustomerDropdown, type CustomerDropdownProps } from '../customer/customer-dropdown';

const alice: Customer = { id: 'alice', name: 'Alice Martin', email: 'alice@test.com' };
const abby: Customer = { id: 'abby', name: 'Abby', email: 'abby@test.com' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const props = (over: Partial<CustomerDropdownProps> = {}): CustomerDropdownProps => ({ search: vi.fn(), selected: null, onSelect: vi.fn(), online: true, ...over });
const ui = (p: CustomerDropdownProps) => <><CustomerDropdown {...p} /><PortalHost /></>;
const chip = () => screen.getByTestId('customer-dropdown-chip');
const field = () => screen.queryByLabelText('Search customers');
const typeQuery = (value: string) => fireEvent.change(field()!, { target: { value } });
const advance = (ms = 250) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const names = () => screen.getAllByRole('option').map((option) => option.getAttribute('aria-label'));
const key = (target: Element | Document, name: string) => act(() => { fireEvent.keyDown(target, { key: name }); fireEvent.keyUp(target, { key: name }); });
/** `n` customers with ids (and names) `c<offset + i>`. */
const many = (n: number, offset = 0): Customer[] => Array.from({ length: n }, (_, i) => ({ id: `c${offset + i}`, name: `c${offset + i}` }));
const list = () => screen.getByTestId('customer-dropdown-list');
// jsdom measures everything as 0, so any scroll reads as "at the end". react-native-web's ScrollView calls onScroll once at
// the start of a scroll and once more at its end (a 100 ms timer); running that timer here, while the page just asked for is
// still in flight, makes one endReached() one whole scroll gesture, and the next scroll starts afresh (no throttle wait).
const endReached = () => act(async () => { fireEvent.scroll(list()); vi.advanceTimersByTime(100); });

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('CustomerDropdown', () => {
  it("shows Guest on the chip, then the picked customer's name", () => {
    const { rerender } = render(ui(props()));
    // v2's GuestAvatar: a glyph, never initials.
    expect(chip().textContent).toBe('Guest');
    expect(chip().getAttribute('aria-label')).toBe('Customer: Guest');
    rerender(ui(props({ selected: alice })));
    expect(chip().textContent).toContain('AM');
    expect(chip().textContent).toContain('Alice Martin');
  });

  it('no pin without onEditAddress', () => {
    render(ui(props()));
    expect(screen.queryByTestId('customer-dropdown-address')).toBeNull();
  });

  it('the pin opens the address editor, not the search', () => {
    const onEditAddress = vi.fn();
    render(ui(props({ onEditAddress })));
    const pin = screen.getByLabelText('Edit Customer Address');
    fireEvent.click(pin);
    expect(onEditAddress).toHaveBeenCalledOnce();
    expect(field()).toBeNull();
    expect(chip().textContent).not.toContain('Select Customer');
    fireEvent.click(chip());
    expect(field()).not.toBeNull();
    expect(screen.queryByTestId('customer-dropdown-address')).toBeNull();
  });

  it('opens a search panel with Guest first and searches only a typed query', async () => {
    const response = deferred<Customer[]>();
    const search = vi.fn(() => response.promise);
    render(ui(props({ search })));
    fireEvent.click(chip());
    expect(chip().textContent).toContain('Select Customer');
    expect(document.activeElement).toBe(field());
    expect(names()).toEqual(['Guest']);
    await advance();
    expect(search).not.toHaveBeenCalled();
    typeQuery('al');
    await advance();
    expect(search).toHaveBeenCalledExactlyOnceWith('al');
    await act(async () => response.resolve([alice, abby]));
    expect(names()).toEqual(['Guest', 'Alice Martin, alice@test.com', 'Abby, abby@test.com']);
    expect(screen.getByText('alice@test.com')).toBeDefined();
  });

  it('drops a stale response', async () => {
    const older = deferred<Customer[]>();
    const newer = deferred<Customer[]>();
    const search = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    render(ui(props({ search, debounceMs: 50 })));
    fireEvent.click(chip());
    typeQuery('a');
    await advance(50);
    typeQuery('ab');
    await advance(50);
    expect(search.mock.calls).toEqual([['a'], ['ab']]);
    await act(async () => newer.resolve([abby]));
    await act(async () => older.resolve([alice]));
    expect(names()).toEqual(['Guest', 'Abby, abby@test.com']);
  });

  it('without browse, a blank query sends nothing and lists Guest alone', async () => {
    const search = vi.fn(async () => [alice]);
    render(ui(props({ search })));
    fireEvent.click(chip());
    await advance();
    expect(search).not.toHaveBeenCalled();
    expect(names()).toEqual(['Guest']);
    typeQuery('al');
    await advance();
    await act(async () => {});
    expect(names()).toEqual(['Guest', 'Alice Martin, alice@test.com']);
    typeQuery('');
    await advance();
    expect(names()).toEqual(['Guest']);
    expect(search).toHaveBeenCalledOnce();
  });

  it('browse lists customers under Guest on open and when the query is cleared', async () => {
    const browse = vi.fn(async () => [abby, alice]);
    const search = vi.fn(async () => [alice]);
    render(ui(props({ search, browse })));
    expect(browse).not.toHaveBeenCalled();
    fireEvent.click(chip());
    await advance(0);
    await act(async () => {});
    expect(browse).toHaveBeenCalledExactlyOnceWith();
    expect(search).not.toHaveBeenCalled();
    expect(names()).toEqual(['Guest', 'Abby, abby@test.com', 'Alice Martin, alice@test.com']);
    typeQuery('al');
    await advance();
    await act(async () => {});
    expect(names()).toEqual(['Guest', 'Alice Martin, alice@test.com']);
    expect(search).toHaveBeenCalledExactlyOnceWith('al');
    typeQuery('');
    await advance();
    await act(async () => {});
    expect(browse).toHaveBeenCalledTimes(2);
    expect(names()).toEqual(['Guest', 'Abby, abby@test.com', 'Alice Martin, alice@test.com']);
    cleanup();
    const offline = vi.fn(async () => [abby]);
    render(ui(props({ browse: offline, online: false })));
    fireEvent.click(chip());
    await advance();
    expect(offline).not.toHaveBeenCalled();
    expect(names()).toEqual(['Guest']);
  });

  it('drops a stale browse response', async () => {
    const older = deferred<Customer[]>();
    const browse = vi.fn(() => older.promise);
    render(ui(props({ search: vi.fn(async () => [alice]), browse, debounceMs: 50 })));
    fireEvent.click(chip());
    await advance(0);
    expect(browse).toHaveBeenCalledOnce();
    typeQuery('al');
    await advance(50);
    await act(async () => {});
    expect(names()).toEqual(['Guest', 'Alice Martin, alice@test.com']);
    await act(async () => older.resolve([abby]));
    expect(names()).toEqual(['Guest', 'Alice Martin, alice@test.com']);
  });

  it('a search with no matches leaves only Guest and no empty text', async () => {
    render(ui(props({ search: vi.fn(async () => []) })));
    fireEvent.click(chip());
    typeQuery('zzz');
    await advance();
    expect(names()).toEqual(['Guest']);
    expect(screen.queryByText(/No customers found/)).toBeNull();
  });

  it('picking a customer or Guest calls onSelect and closes', async () => {
    const onSelect = vi.fn();
    render(ui(props({ search: vi.fn(async () => [alice]), onSelect })));
    fireEvent.click(chip());
    typeQuery('al');
    await advance();
    fireEvent.click(screen.getByRole('option', { name: 'Alice Martin, alice@test.com' }));
    expect(onSelect).toHaveBeenLastCalledWith(alice);
    expect(field()).toBeNull();
    fireEvent.click(chip());
    expect(field()).toHaveProperty('value', '');
    expect(names()).toEqual(['Guest']);
    fireEvent.click(screen.getByRole('option', { name: 'Guest' }));
    expect(onSelect.mock.calls).toEqual([[alice], [null]]);
    expect(field()).toBeNull();
  });

  it('offline: the field is read-only, the note shows, Guest still picks', async () => {
    const search = vi.fn(async () => [alice]);
    const onSelect = vi.fn();
    render(ui(props({ search, onSelect, online: false })));
    fireEvent.click(chip());
    expect(field()).toHaveProperty('readOnly', true);
    expect(screen.getByText('Connect to search customers.')).toBeDefined();
    typeQuery('al');
    await advance();
    expect(search).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('option', { name: 'Guest' }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('errors: a network error shows its text without onError; unauthorized calls onError', async () => {
    for (const [error, message, report] of [[new CustomerServiceError('network', 'offline'), "Couldn't reach the store. Try again.", false],
      [new ConnectorUnauthorizedError('expired credentials', 401), 'Sign in again to continue.', true]] as const) {
      const response = deferred<Customer[]>();
      const onError = vi.fn();
      const { unmount } = render(ui(props({ search: () => response.promise, onError })));
      fireEvent.click(chip());
      typeQuery('a');
      await advance();
      await act(async () => response.reject(error));
      expect(screen.getByRole('alert').textContent).toBe(message);
      expect(onError.mock.calls).toEqual(report ? [[error]] : []);
      expect(names()).toEqual(['Guest']);
      unmount();
    }
  });

  it('keyboard: ArrowDown from the field focuses Guest, Escape closes and refocuses the chip', () => {
    render(ui(props()));
    fireEvent.click(chip());
    expect(document.activeElement).toBe(field());
    key(document.activeElement!, 'ArrowDown');
    expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Guest' }));
    key(document.activeElement!, 'ArrowDown');
    expect(document.activeElement).toBe(field());
    key(document.activeElement!, 'ArrowUp');
    expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Guest' }));
    key(document, 'Escape');
    expect(field()).toBeNull();
    expect(document.activeElement).toBe(chip());
    fireEvent.click(chip());
    expect(document.activeElement).toBe(field());
    key(field()!, 'Escape');
    expect(field()).toBeNull();
    expect(document.activeElement).toBe(chip());
  });

  it('Enter on a focused option picks it', async () => {
    const onSelect = vi.fn();
    render(ui(props({ search: vi.fn(async () => [alice, abby]), onSelect })));
    fireEvent.click(chip());
    typeQuery('a');
    await advance();
    key(document.activeElement!, 'ArrowUp');
    expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Abby, abby@test.com' }));
    key(document.activeElement!, 'Enter');
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(abby);
    expect(field()).toBeNull();
  });

  it('one page only when the app ignores the page argument', async () => {
    const fifty = many(50);
    const browse = vi.fn(async (_page?: number) => fifty);
    render(ui(props({ browse })));
    fireEvent.click(chip());
    await advance();
    await endReached();
    await advance();
    expect(browse.mock.calls).toEqual([[], [2]]);
    expect(names()).toHaveLength(51);
    expect(new Set(names()).size).toBe(51);
    await endReached();
    await advance();
    expect(browse).toHaveBeenCalledTimes(2);
  });

  it('end-reached appends the next page', async () => {
    const browse = vi.fn(async (page?: number) => (page === 2 ? many(50, 50) : many(50)));
    const search = vi.fn(async (_query: string, page?: number) => (page === 2 ? many(3, 200) : many(50, 100)));
    render(ui(props({ search, browse })));
    fireEvent.click(chip());
    await advance();
    await endReached();
    await advance();
    expect(browse.mock.calls).toEqual([[], [2]]);
    expect(names()).toEqual(['Guest', ...many(100).map((customer) => customer.name)]);
    // Typed searches page too, as v2.
    typeQuery('c');
    await advance();
    await endReached();
    await advance();
    expect(search.mock.calls).toEqual([['c'], ['c', 2]]);
    expect(names()).toHaveLength(54);
  });

  it('a stale page response is dropped', async () => {
    const second = deferred<Customer[]>();
    const browse = vi.fn((page?: number) => (page === 2 ? second.promise : Promise.resolve(many(50))));
    render(ui(props({ browse })));
    fireEvent.click(chip());
    await advance();
    await endReached();
    // v2's latch: one later page in flight at a time.
    await endReached();
    expect(browse.mock.calls).toEqual([[], [2]]);
    key(document, 'Escape');
    fireEvent.click(chip());
    await advance();
    expect(browse.mock.calls).toEqual([[], [2], []]);
    expect(names()).toHaveLength(51);
    await act(async () => second.resolve(many(50, 50)));
    expect(names()).toEqual(['Guest', ...many(50).map((customer) => customer.name)]);
  });

  it('no request offline', async () => {
    const browse = vi.fn(async (_page?: number) => many(50));
    const { rerender } = render(ui(props({ browse, online: false })));
    fireEvent.click(chip());
    await endReached();
    await advance();
    expect(browse).not.toHaveBeenCalled();
    rerender(ui(props({ browse, online: true })));
    await advance();
    expect(names()).toHaveLength(51);
    rerender(ui(props({ browse, online: false })));
    await endReached();
    await advance();
    expect(browse).toHaveBeenCalledExactlyOnceWith();
  });

  it('no further request once a short page says there is no more', async () => {
    const browse = vi.fn(async (page?: number) => (page === 2 ? many(10, 50) : many(50)));
    render(ui(props({ browse })));
    fireEvent.click(chip());
    await advance();
    await endReached();
    await advance();
    expect(names()).toHaveLength(61);
    await endReached();
    await advance();
    await endReached();
    await advance();
    expect(browse).toHaveBeenCalledTimes(2);
    cleanup();
    const few = vi.fn(async (_page?: number) => many(3));
    render(ui(props({ browse: few })));
    fireEvent.click(chip());
    await advance();
    await endReached();
    await advance();
    expect(few).toHaveBeenCalledOnce();
  });

  it("clears a later page's error once the retry loads", async () => {
    let calls = 0;
    const browse = vi.fn(async (page?: number) => {
      if (page !== 2) return many(50);
      if (calls++ === 0) throw new CustomerServiceError('network', 'offline');
      return many(10, 50);
    });
    render(ui(props({ browse })));
    fireEvent.click(chip());
    await advance();
    await endReached();
    await advance();
    expect(screen.getByRole('alert').textContent).toBe("Couldn't reach the store. Try again.");
    await endReached();
    await advance();
    expect(browse.mock.calls).toEqual([[], [2], [2]]);
    expect(names()).toHaveLength(61);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
