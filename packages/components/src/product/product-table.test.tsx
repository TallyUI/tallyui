import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Text } from 'react-native';
import { ConnectorProvider } from '@tallyui/core';
import { medusaConnector } from '@tallyui/connector-medusa';
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

  it('sorts Stock by the provider stock overlay, not the raw document', () => {
    const docA = { id: 'a', title: 'Alpha', status: 'published', variants: [
      { id: 'variant-a', title: 'Alpha', sku: 'ALPHA', prices: [{ amount: 20, currency_code: 'eur' }],
        manage_inventory: true, inventory_items: [{ inventory_item_id: 'inv-a', required_quantity: 1,
          inventory: { location_levels: [{ stocked_quantity: 5, reserved_quantity: 0 }] } }] },
    ] };
    const docB = { id: 'b', title: 'Beta', status: 'published', variants: [
      { id: 'variant-b', title: 'Beta', sku: 'BETA', prices: [{ amount: 20, currency_code: 'eur' }],
        manage_inventory: true, inventory_items: [{ inventory_item_id: 'inv-b', required_quantity: 1,
          inventory: { location_levels: [{ stocked_quantity: 9, reserved_quantity: 0 }] } }] },
    ] };
    expect(medusaConnector.traits.product.getStock(docA).quantity).toBe(5);
    const overlay = new Map([['inv-a', [{ stocked_quantity: 20, reserved_quantity: 0 }]]]);
    render(
      <ConnectorProvider connector={medusaConnector} traitContext={{ currency: 'EUR' }} stockOverlay={overlay}>
        <ProductTable items={[docA, docB]} />
      </ConnectorProvider>,
    );
    fireEvent.click(screen.getByTestId('product-table-sort-stock'));
    expect(rowIds()).toEqual(['product-row-b', 'product-row-a']);
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

describe('ProductTable row extras', () => {
  const heads = () => screen.getAllByRole('columnheader');
  const hoodie = { id: 'hoodie', title: 'Hoodie', status: 'published', variants: ['S', 'M'].map((size) => (
    { id: 'hoodie-' + size, title: size, sku: 'HOODIE-' + size, prices: [{ amount: 30, currency_code: 'eur' }], manage_inventory: false })) };

  it('renders the existing table when neither flag is set', () => {
    render(table({ onSelect: vi.fn() }));
    expect(screen.queryAllByTestId(/^product-row-add-/)).toHaveLength(0);
    expect(heads().map((head) => head.getAttribute('aria-label'))).toEqual(Array(6).fill(null));
    expect(heads().map((head) => head.textContent)).toEqual(['Name', 'SKU', 'Barcode', 'Price', 'Stock', 'Category']);
  });

  it('leads each row with the product image or its initial tile under showThumbnail', () => {
    render(table({ items: [items[0], { ...items[2], images: [] }], showThumbnail: true }));
    expect(heads()).toHaveLength(7);
    expect([heads()[0].getAttribute('aria-label'), heads()[0].textContent]).toEqual(['Image', '']);
    const [image, tile] = ['product-row-1', 'product-row-3'].map((id) => within(screen.getByTestId(id)).getAllByRole('cell')[0]);
    expect(image.querySelector('img')).not.toBeNull();
    expect(within(tile).getByRole('img', { name: 'Apple' }).textContent).toBe('A');
  });

  it('ends each row with Add to cart, which calls onSelect once with its item', () => {
    const onSelect = vi.fn();
    render(table({ onSelect, showAddButton: true }));
    expect(heads().at(-1)!.getAttribute('aria-label')).toBe('Actions');
    expect(items.map((item) => screen.getByTestId('product-row-add-' + item.id).getAttribute('aria-label'))).toEqual(Array(3).fill('Add to cart'));
    fireEvent.click(screen.getByTestId('product-row-add-2'));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(items[1]);
  });

  it('labels the button Variations for a product with two variants', () => {
    const onSelect = vi.fn();
    render(
      <ConnectorProvider connector={medusaConnector} traitContext={{ currency: 'EUR' }}>
        <ProductTable items={[hoodie]} onSelect={onSelect} showAddButton />
      </ConnectorProvider>,
    );
    const button = screen.getByTestId('product-row-add-hoodie');
    expect(button.getAttribute('aria-label')).toBe('Variations');
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(hoodie);
  });

  it('draws no add button without onSelect', () => {
    render(table({ showAddButton: true }));
    expect(screen.queryAllByTestId(/^product-row-add-/)).toHaveLength(0);
    expect(heads()).toHaveLength(6);
  });

  it('shows the cart count in place of the + and adds on press', () => {
    const onSelect = vi.fn();
    render(table({ onSelect, showAddButton: true, cartQuantity: (doc) => (doc.id === 2 ? 3 : 0) }));
    expect(screen.getByTestId('product-row-in-cart-2').textContent).toBe('3');
    expect(screen.getByTestId('product-row-add-2').getAttribute('aria-label')).toBe('In cart: 3');
    expect(screen.getByTestId('product-row-add-1').getAttribute('aria-label')).toBe('Add to cart');
    expect(screen.queryByTestId('product-row-in-cart-1')).toBeNull();
    fireEvent.click(screen.getByTestId('product-row-add-2'));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(items[1]);
  });

  it('keeps the > and no count for a product with variants', () => {
    render(
      <ConnectorProvider connector={medusaConnector} traitContext={{ currency: 'EUR' }}>
        <ProductTable items={[hoodie]} onSelect={vi.fn()} showAddButton cartQuantity={() => 2} />
      </ConnectorProvider>,
    );
    expect(screen.getByTestId('product-row-add-hoodie').getAttribute('aria-label')).toBe('Variations');
    expect(screen.queryByTestId('product-row-in-cart-hoodie')).toBeNull();
  });

  it('draws no count without the add column', () => {
    render(table({ onSelect: vi.fn(), cartQuantity: () => 3 }));
    expect(screen.queryAllByTestId(/^product-row-in-cart-/)).toHaveLength(0);
  });
});

describe('ProductTable loading', () => {
  it('loading with no items draws the header and one line placeholder per column per row', () => {
    render(table({ items: [], loading: true, emptyState: <Text>Nothing here</Text> }));
    expect(screen.getAllByRole('columnheader').map((head) => head.textContent))
      .toEqual(['Name', 'SKU', 'Barcode', 'Price', 'Stock', 'Category']);
    expect(screen.queryByText('Nothing here')).toBeNull();
    const [first] = screen.getAllByTestId('product-table-skeleton-row');
    const cells = within(first).getAllByRole('cell');
    expect(cells).toHaveLength(6);
    for (const cell of cells) expect(cell.querySelectorAll('[aria-busy="true"]')).toHaveLength(1);
    expect(screen.getByLabelText('Loading').getAttribute('aria-busy')).toBe('true');
  });

  it('loading with items draws the items', () => {
    render(table({ loading: true }));
    expect(rowIds()).toEqual(['product-row-1', 'product-row-2', 'product-row-3']);
    expect(screen.queryAllByTestId('product-table-skeleton-row')).toHaveLength(0);
  });
});
