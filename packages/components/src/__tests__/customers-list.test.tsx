import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Customer } from '@tallyui/core';
import { CustomersList, type CustomersListProps } from '../customer/customers-list';
import { I18nProvider } from '../i18n';

const ada: Customer = { id: 'ada', name: 'Ada Lovelace', email: 'ada@example.test', billing: { city: 'London', country: 'GB' } };
const bo: Customer = { id: 'bo', name: 'Bo' };
const cy: Customer = { id: 'cy', name: 'Cy Twain', email: 'cy@example.test', billing: { country: 'US' } };
const three = [ada, bo, cy];

const props = (over: Partial<CustomersListProps> = {}): CustomersListProps => ({ customers: three, query: '', onQueryChange: vi.fn(), ...over });
const row = (id: string) => screen.getByTestId(`customers-list-row-${id}`);
const field = () => screen.getByTestId('customers-list-search');
/** Gives the scroll node the sizes react-native-web reads (scrollTop, scrollHeight, offsetHeight), then scrolls it once. */
const scrollTo = (top: number) => {
  const node = screen.getByTestId('customers-list-scroll');
  Object.defineProperty(node, 'scrollTop', { configurable: true, value: top });
  Object.defineProperty(node, 'scrollHeight', { configurable: true, value: 1000 });
  Object.defineProperty(node, 'offsetHeight', { configurable: true, value: 100 });
  act(() => { fireEvent.scroll(node); });
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('CustomersList', () => {
  it('CL1: rows in order with name, email and location', () => {
    render(<CustomersList {...props()} />);
    expect(screen.getAllByTestId(/^customers-list-row-/).map((node) => node.getAttribute('data-testid'))).toEqual(['customers-list-row-ada', 'customers-list-row-bo', 'customers-list-row-cy']);
    expect(within(row('ada')).getByText('Ada Lovelace')).toBeDefined();
    expect(within(row('ada')).getByText('ada@example.test')).toBeDefined();
    expect(within(row('ada')).getByText('London, GB')).toBeDefined();
    expect(within(row('cy')).getByText('Cy Twain')).toBeDefined();
    expect(within(row('cy')).getByText('cy@example.test')).toBeDefined();
    expect(within(row('cy')).getByText('US')).toBeDefined();
    // Bo: the initial, the name, and nothing else.
    expect(row('bo').textContent).toBe('BBo');
  });

  it('CL2: rows open the customer only with onOpen', () => {
    const onOpen = vi.fn();
    render(<CustomersList {...props({ onOpen })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open customer: Ada Lovelace' }));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(ada);
    cleanup();
    render(<CustomersList {...props()} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('CL3: typing in the search field calls onQueryChange', () => {
    const onQueryChange = vi.fn();
    render(<CustomersList {...props({ onQueryChange })} />);
    expect(field().getAttribute('placeholder')).toBe('Search Customers');
    fireEvent.change(field(), { target: { value: 'lo' } });
    expect(onQueryChange).toHaveBeenCalledExactlyOnceWith('lo');
  });

  it('CL4: no customers and no query shows the empty state', () => {
    render(<CustomersList {...props({ customers: [] })} />);
    const empty = screen.getByTestId('customers-list-empty');
    expect(within(empty).getByText('No customers yet')).toBeDefined();
    expect(within(empty).getByText('Customers you add, and anyone who buys from you, will appear here.')).toBeDefined();
    expect(screen.queryByTestId('customers-list-no-results')).toBeNull();
  });

  it('CL5: no customers for a query shows no results with Clear search', () => {
    const onQueryChange = vi.fn();
    render(<CustomersList {...props({ customers: [], query: 'zz', onQueryChange })} />);
    const block = screen.getByTestId('customers-list-no-results');
    expect(within(block).getByText('No customers match your search')).toBeDefined();
    expect(screen.queryByTestId('customers-list-empty')).toBeNull();
    fireEvent.click(within(block).getByRole('button', { name: 'Clear search' }));
    expect(onQueryChange).toHaveBeenCalledExactlyOnceWith('');
  });

  it('CL6: loading shows the loading row and no empty block', () => {
    render(<CustomersList {...props({ customers: [], loading: true })} />);
    expect(screen.getByTestId('customers-list-loading')).toBeDefined();
    expect(screen.queryByTestId('customers-list-empty')).toBeNull();
    expect(screen.queryByTestId('customers-list-no-results')).toBeNull();
    cleanup();
    render(<CustomersList {...props({ customers: [], query: 'zz', loading: true })} />);
    expect(screen.queryByTestId('customers-list-empty')).toBeNull();
    expect(screen.queryByTestId('customers-list-no-results')).toBeNull();
  });

  it('CL7: onEndReached within a tenth of the visible height of the end, not before', () => {
    const onEndReached = vi.fn();
    render(<CustomersList {...props({ onEndReached })} />);
    // 1000 - (895 + 100) = 5, within 10% of 100.
    scrollTo(895);
    expect(onEndReached).toHaveBeenCalledOnce();
    cleanup();
    const early = vi.fn();
    render(<CustomersList {...props({ onEndReached: early })} />);
    // 1000 - (850 + 100) = 50, half the visible height away.
    scrollTo(850);
    expect(early).not.toHaveBeenCalled();
  });

  it('CL8: an error shows as an alert above the first row', () => {
    render(<CustomersList {...props({ error: 'Could not reach the store.' })} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Could not reach the store.');
    expect(alert.compareDocumentPosition(row('ada')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('CL9: the placeholder is translated', () => {
    render(<I18nProvider locale="fr" resources={{ fr: { 'common.search_customers': 'Rechercher' } }}><CustomersList {...props()} /></I18nProvider>);
    expect(field().getAttribute('placeholder')).toBe('Rechercher');
  });
});
