import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerServiceError, type Customer, type CustomerInput } from '@tallyui/core';
import { CustomerPicker } from '../customer/customer-picker';

const alice: Customer = { id: 'alice', name: 'Alice', email: 'alice@test.com' };
const abby: Customer = { id: 'abby', name: 'Abby', email: 'abby@test.com' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const typeQuery = (value: string) => fireEvent.change(screen.getByLabelText('Search customers'), { target: { value } });
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const advance = (ms = 250) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('CustomerPicker', () => {
  it('debounces the search and shows the results', async () => {
    const response = deferred<Customer[]>();
    const search = vi.fn(() => response.promise);
    render(<CustomerPicker search={search} selected={null} onSelect={vi.fn()} online />);
    expect(screen.queryByRole('button', { name: 'New customer' })).toBeNull();
    expect(screen.getByText('Search customers')).toBeDefined();
    typeQuery('a');
    await advance(200);
    typeQuery('al');
    await advance(249);
    expect(search).not.toHaveBeenCalled();
    await advance(1);
    expect(search).toHaveBeenCalledExactlyOnceWith('al');
    await act(async () => response.resolve([alice]));
    expect(screen.getByRole('option', { name: 'Alice' })).toBeDefined();
    expect(screen.getByText('alice@test.com')).toBeDefined();
  });

  it('drops a stale search response that resolves after a newer one', async () => {
    const older = deferred<Customer[]>();
    const newer = deferred<Customer[]>();
    const search = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    render(<CustomerPicker search={search} selected={null} onSelect={vi.fn()} online debounceMs={50} />);
    typeQuery('a');
    await advance(50);
    typeQuery('ab');
    await advance(50);
    expect(search.mock.calls).toEqual([['a'], ['ab']]);
    await act(async () => newer.resolve([abby]));
    expect(screen.getByRole('option', { name: 'Abby' })).toBeDefined();
    await act(async () => older.resolve([alice]));
    expect(screen.getByRole('option', { name: 'Abby' })).toBeDefined();
    expect(screen.queryByText('Alice')).toBeNull();
  });

  it('an empty query clears results without searching', async () => {
    const response = deferred<Customer[]>();
    const search = vi.fn(() => response.promise);
    render(<CustomerPicker search={search} selected={null} onSelect={vi.fn()} online />);
    for (const empty of ['', '   ']) {
      typeQuery('a');
      await advance();
      await act(async () => response.resolve([alice]));
      expect(screen.getByText('Alice')).toBeDefined();
      const calls = search.mock.calls.length;
      typeQuery(empty);
      expect(screen.queryByText('Alice')).toBeNull();
      await advance();
      expect(search).toHaveBeenCalledTimes(calls);
    }
  });

  it.each(['picking a result selects it and clears the query', 'choosing a search result selects it'])(
    '%s', async () => {
      const response = deferred<Customer[]>();
      const search = vi.fn(() => response.promise);
      const onSelect = vi.fn();
      render(<CustomerPicker search={search} selected={null} onSelect={onSelect} online />);
      typeQuery('a');
      await advance();
      await act(async () => response.resolve([alice]));
      fireEvent.click(screen.getByRole('option', { name: 'Alice' }));
      expect(onSelect).toHaveBeenCalledExactlyOnceWith(alice);
      expect(screen.getByLabelText('Search customers')).toHaveProperty('value', '');
      expect(screen.queryByRole('option')).toBeNull();
      await advance();
      expect(search).toHaveBeenCalledTimes(1);
    },
  );

  it('Guest clears the selected customer', () => {
    const onSelect = vi.fn();
    render(<CustomerPicker search={vi.fn()} selected={alice} onSelect={onSelect} online />);
    expect(screen.getByText('Alice')).toBeDefined();
    click('Guest');
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('creates a customer with only the filled fields and selects it', async () => {
    const response = deferred<Customer>();
    const create = vi.fn<(input: CustomerInput) => Promise<Customer>>(() => response.promise);
    const onSelect = vi.fn();
    render(<CustomerPicker search={vi.fn()} create={create} selected={null} onSelect={onSelect} online />);
    click('New customer');
    expect(screen.queryByText('Address')).toBeNull();
    for (const label of ['First Name', 'Last Name', 'Email', 'Phone']) expect(screen.getByText(label)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Save Customer' }).getAttribute('aria-disabled')).toBe('true');
    click('Save Customer');
    expect(create).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText('email@example.com'), { target: { value: 'alice@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Alice' } });
    expect(screen.getByRole('button', { name: 'Save Customer' }).getAttribute('aria-disabled')).not.toBe('true');
    click('Save Customer');
    expect(create).toHaveBeenCalledExactlyOnceWith({ email: 'alice@test.com', firstName: 'Alice' });
    expect(screen.getByRole('button', { name: 'Save Customer' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('button', { name: 'New customer' }).getAttribute('aria-disabled')).toBe('true');
    click('Save Customer');
    expect(create).toHaveBeenCalledTimes(1);
    await act(async () => response.resolve(alice));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(alice);
    expect(screen.queryByPlaceholderText('email@example.com')).toBeNull();
  });

  it("shows the network message on a network error, and the server's message otherwise", async () => {
    for (const source of ['search', 'create']) {
      for (const code of ['network', 'server'] as const) {
        const response = deferred<Customer[] & Customer>();
        const search = vi.fn(() => response.promise);
        const create = vi.fn(() => response.promise);
        const { unmount } = render(<CustomerPicker search={search} create={create} selected={null} onSelect={vi.fn()} online />);
        if (source === 'search') {
          typeQuery('a');
          await advance();
          expect(search).toHaveBeenCalledTimes(1);
        } else {
          click('New customer');
          fireEvent.change(screen.getByPlaceholderText('email@example.com'), { target: { value: 'alice@test.com' } });
          click('Save Customer');
          expect(create).toHaveBeenCalledTimes(1);
        }
        await act(async () => response.reject(new CustomerServiceError(code, 'Customer service unavailable')));
        expect(screen.getByRole('alert').textContent).toBe(code === 'network'
          ? "Couldn't reach the store. Try again." : 'Customer service unavailable');
        typeQuery('retry');
        expect(screen.getByLabelText('Search customers')).toHaveProperty('value', 'retry');
        if (source === 'create') expect(screen.getByRole('button', { name: 'Save Customer' }).getAttribute('aria-disabled')).not.toBe('true');
        unmount();
      }
    }
  });

  it('offline disables search and create, makes no calls, and still allows Guest', async () => {
    const search = vi.fn(async () => [alice]);
    const create = vi.fn(async () => alice);
    const onSelect = vi.fn();
    const props = { search, create, selected: alice, onSelect };
    const { rerender } = render(<CustomerPicker {...props} online={false} />);
    expect(screen.getByText('Connect to search or add customers.')).toBeDefined();
    expect(screen.getByLabelText('Search customers')).toHaveProperty('readOnly', true);
    typeQuery('offline');
    expect(screen.getByRole('button', { name: 'New customer' }).getAttribute('aria-disabled')).toBe('true');
    click('New customer');
    expect(screen.queryByPlaceholderText('email@example.com')).toBeNull();
    await advance();
    expect(search).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText('Alice')).toBeDefined();
    click('Guest');
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(null);
    rerender(<CustomerPicker {...props} online />);
    typeQuery('a');
    click('New customer');
    fireEvent.change(screen.getByPlaceholderText('email@example.com'), { target: { value: 'alice@test.com' } });
    rerender(<CustomerPicker {...props} online={false} />);
    expect(screen.getByRole('button', { name: 'Save Customer' }).getAttribute('aria-disabled')).toBe('true');
    click('Save Customer');
    await advance();
    expect(search).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText('Alice')).toBeDefined();
  });
});
