import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { ConnectorProvider } from '@tallyui/core';
import { ProductTable, type ProductTableProps } from './product-table';
import { createTestConnector, wooDoc } from '../__tests__/helpers';

const connector = createTestConnector('woo');
const items = [
  { ...wooDoc, id: 1, name: 'Item 10', regular_price: '10.00', sale_price: '', on_sale: false },
  { ...wooDoc, id: 2, name: 'Item 2', regular_price: '20.00', sale_price: '5.00', on_sale: true },
  { ...wooDoc, id: 3, name: 'Apple', regular_price: '8.00', sale_price: '', on_sale: false },
];
const table = (props: Partial<ProductTableProps> = {}) => (
  <ConnectorProvider connector={connector} traitContext={{ currency: 'USD' }}>
    <ProductTable items={items} {...props} />
  </ConnectorProvider>
);
const rowIds = () => screen.getAllByTestId(/^product-row-/).map((row) => row.getAttribute('data-testid'));

afterEach(() => cleanup());

describe('ProductTable', () => {
  it('renders six default headers in order and one row per item', () => {
    render(table());
    expect(screen.getAllByRole('columnheader').map((head) => head.textContent))
      .toEqual(['Name', 'SKU', 'Barcode', 'Price', 'Stock', 'Category']);
    expect(rowIds()).toEqual(['product-row-1', 'product-row-2', 'product-row-3']);
    expect(screen.getAllByRole('cell')).toHaveLength(18);
  });

  it('cycles Name through ascending, descending and original order', () => {
    const onSortChange = vi.fn();
    render(table({ items: [items[1], items[0], items[2]], onSortChange }));
    const button = screen.getByTestId('product-table-sort-name');
    const head = screen.getAllByRole('columnheader')[0];
    expect(button.getAttribute('aria-label')).toBe('Sort by Name');
    fireEvent.click(button);
    expect(rowIds()).toEqual(['product-row-3', 'product-row-2', 'product-row-1']);
    expect(head.getAttribute('aria-sort')).toBe('ascending');
    expect(button.textContent).toBe('Name ▲');
    fireEvent.click(button);
    expect(rowIds()).toEqual(['product-row-1', 'product-row-2', 'product-row-3']);
    expect(head.getAttribute('aria-sort')).toBe('descending');
    expect(button.textContent).toBe('Name ▼');
    fireEvent.click(button);
    expect(rowIds()).toEqual(['product-row-2', 'product-row-1', 'product-row-3']);
    expect(head.getAttribute('aria-sort')).toBe('none');
    expect(button.textContent).toBe('Name');
    expect(onSortChange.mock.calls).toEqual([
      [{ field: 'name', dir: 'asc' }], [{ field: 'name', dir: 'desc' }], [null],
    ]);
  });

  it('sorts by the resolved price, including a sale price', () => {
    render(table());
    fireEvent.click(screen.getByTestId('product-table-sort-price'));
    expect(rowIds()).toEqual(['product-row-2', 'product-row-3', 'product-row-1']);
  });

  it('reports controlled sort presses but follows only the sort prop', () => {
    const onSortChange = vi.fn();
    const { rerender } = render(table({ sort: { field: 'name', dir: 'asc' }, onSortChange }));
    fireEvent.click(screen.getByTestId('product-table-sort-name'));
    expect(onSortChange).toHaveBeenCalledWith({ field: 'name', dir: 'desc' });
    expect(rowIds()).toEqual(['product-row-3', 'product-row-2', 'product-row-1']);
    rerender(table({ sort: { field: 'name', dir: 'desc' }, onSortChange }));
    expect(rowIds()).toEqual(['product-row-1', 'product-row-2', 'product-row-3']);
    rerender(table({ sort: null, onSortChange }));
    fireEvent.click(screen.getByTestId('product-table-sort-name'));
    expect(onSortChange).toHaveBeenLastCalledWith({ field: 'name', dir: 'asc' });
    expect(rowIds()).toEqual(['product-row-1', 'product-row-2', 'product-row-3']);
  });

  it('shows the sort without sorting items when sortItems is false', () => {
    render(table({ sort: { field: 'name', dir: 'asc' }, sortItems: false }));
    expect(rowIds()).toEqual(['product-row-1', 'product-row-2', 'product-row-3']);
    expect(screen.getAllByRole('columnheader')[0].getAttribute('aria-sort')).toBe('ascending');
    expect(screen.getByText('Name ▲')).toBeDefined();
  });

  it('supports custom columns without a provider and leaves unsortable headers plain', () => {
    render(<ProductTable items={items} columns={[
      { id: 'name', header: 'Name', render: (doc) => <Text>{doc.name}</Text> },
    ]} />);
    expect(rowIds()).toHaveLength(3);
    expect(screen.queryByTestId('product-table-sort-name')).toBeNull();
    expect(screen.getByRole('columnheader').hasAttribute('aria-sort')).toBe(false);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('passes the pressed row document to onSelect', () => {
    const onSelect = vi.fn();
    render(table({ onSelect }));
    const row = screen.getByTestId('product-row-2');
    expect(row.getAttribute('role')).toBe('button');
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith(items[1]);
  });

  it('hides unsellable products unless showUnsellable is set', () => {
    const docs = [items[0], { ...items[1], status: 'draft' }];
    const { rerender } = render(table({ items: docs }));
    expect(rowIds()).toEqual(['product-row-1']);
    rerender(table({ items: docs, showUnsellable: true }));
    expect(rowIds()).toEqual(['product-row-1', 'product-row-2']);
  });

  it('renders the empty state without the table or headers', () => {
    render(table({ items: [], emptyState: <Text>No products</Text> }));
    expect(screen.getByText('No products')).toBeDefined();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryAllByRole('columnheader')).toHaveLength(0);
  });

  it('mounts fewer than 200 rows initially for 2,000 items', () => {
    render(<ProductTable items={Array.from({ length: 2000 }, (_, i) => ({ id: 'p' + i }))}
      columns={[{ id: 'id', header: 'ID', render: (doc) => <Text>{doc.id}</Text> }]} />);
    expect(screen.queryAllByTestId(/^product-row-/).length).toBeLessThan(200);
    expect(screen.getByTestId('product-row-p0')).toBeDefined();
  });
});
