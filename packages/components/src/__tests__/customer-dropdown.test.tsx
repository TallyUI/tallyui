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
});
