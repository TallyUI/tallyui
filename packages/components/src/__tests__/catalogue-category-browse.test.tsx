import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { medusaConnector } from '@tallyui/connector-medusa';
import { Catalogue } from '../sale/catalogue';
import type { CategoryNavProps, ProductGrid } from '../product';

vi.mock('../product', () => ({
  CategoryNav: ({ categories, selectedId, onSelect }: CategoryNavProps) => (
    <div data-testid="category-nav">
      {categories.map(({ id, name }) => (
        <button key={id} data-testid={`category-${id}`} aria-pressed={selectedId === id} onClick={() => onSelect(id)}>{name}</button>
      ))}
    </div>
  ),
  ProductGrid: ({ items, renderItem, emptyState, numColumns }: ComponentProps<typeof ProductGrid>) => (
    <div data-testid="grid" data-columns={numColumns}>
      {items.length ? items.map((item: { id: string }, index: number) => <div key={item.id}>{renderItem(item, index)}</div>) : emptyState}
    </div>
  ),
  ProductImage: () => null,
  ProductTitle: ({ doc }: { doc: { title?: ReactNode } }) => <span>{doc.title}</span>,
  ProductPrice: () => null,
  ProductStockBadge: () => null,
}));
vi.mock('../input', () => ({
  SearchInput: ({ value, onChangeText, placeholder }: { value: string; onChangeText: (text: string) => void; placeholder?: string }) => (
    <input value={value} placeholder={placeholder} onChange={(event) => onChangeText(event.target.value)} />
  ),
}));
vi.mock('../ui', () => ({
  VStack: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

const traits = medusaConnector.traits.product;
const categories = [{ id: 'pcat_hats', name: 'Hats' }, { id: 'pcat_shirts', name: 'Shirts' }];
const products = [
  { id: 'hat', title: 'Blue Hat', status: 'published', categories: [categories[0]], variants: [
    { id: 'hat-one', title: 'One size', sku: 'LARGE-CODE', barcode: '111',
      prices: [{ amount: 10, currency_code: 'eur' }], manage_inventory: false },
  ] },
  { id: 'shirt', title: 'Red Shirt', status: 'published', categories: [categories[1]], variants: [
    { id: 'small', title: 'Small', sku: 'SHIRT-S', barcode: '222',
      prices: [{ amount: 20, currency_code: 'eur' }], manage_inventory: false },
    { id: 'large', title: 'Large', sku: 'SHIRT-L', barcode: 'LARGE-CODE',
      prices: [{ amount: 25, currency_code: 'eur' }], manage_inventory: true, inventory_quantity: 0 },
  ] },
  { id: 'both', title: 'Hat and Shirt', status: 'published', categories, variants: [
    { id: 'both-one', title: 'One size', prices: [{ amount: 30, currency_code: 'eur' }], manage_inventory: false },
  ] },
];
const props = { products, traits, currency: 'EUR', onSelect: vi.fn(), lastSyncedAt: null, showCategoryNav: true };

afterEach(() => cleanup());

describe('Catalogue category browse', () => {
  it('keeps the chips by default', () => {
    render(<Catalogue {...props} />);
    expect(screen.getByTestId('category-nav')).toBeTruthy();
    expect(screen.queryByTestId('category-browse')).toBeNull();
  });

  it('opens on the tiles: All products first, then each category with its count', () => {
    render(<Catalogue {...props} categoryBrowse="tiles" />);
    expect(screen.queryByTestId('category-nav')).toBeNull();
    expect(screen.queryByTestId('grid')).toBeNull();
    const tiles = within(screen.getByTestId('category-browse')).getAllByRole('button');
    expect(tiles.map((tile) => tile.getAttribute('data-testid')))
      .toEqual(['category-tile-all', 'category-tile-pcat_hats', 'category-tile-pcat_shirts']);
    expect(within(tiles[0]).getByText('3 products')).toBeTruthy();
    expect(within(tiles[1]).getByText('2 products')).toBeTruthy();
    expect(within(tiles[2]).getByText('2 products')).toBeTruthy();
  });

  it('shows a category picture from the categories prop', () => {
    render(<Catalogue {...props} categoryBrowse="tiles"
      categories={[{ ...categories[0], imageUrl: 'https://example.test/hats.jpg' }, categories[1]]} />);
    const hats = within(screen.getByTestId('category-tile-pcat_hats'));
    expect(hats.getByTestId('category-tile-pcat_hats-image')).toBeTruthy();
    expect(screen.getByTestId('category-tile-pcat_hats').querySelector('img')?.getAttribute('src')).toBe('https://example.test/hats.jpg');
    expect(within(screen.getByTestId('category-tile-pcat_shirts')).getByTestId('category-tile-pcat_shirts-fallback')).toBeTruthy();
  });

  it('opens a category under the crumb and goes back', () => {
    const onStateChange = vi.fn();
    render(<Catalogue {...props} categoryBrowse="tiles" onStateChange={onStateChange} />);
    fireEvent.click(screen.getByTestId('category-tile-pcat_hats'));
    expect(within(screen.getByTestId('grid')).getAllByTestId(/^product-tile-/).map((tile) => tile.getAttribute('data-testid')))
      .toEqual(['product-tile-Blue Hat', 'product-tile-Hat and Shirt']);
    const crumb = within(screen.getByTestId('category-crumb'));
    expect(crumb.getByText('Categories')).toBeTruthy();
    expect(crumb.getByText('Hats')).toBeTruthy();
    expect(onStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ categoryId: 'pcat_hats' }));
    fireEvent.click(screen.getByTestId('category-crumb-root'));
    expect(screen.getByTestId('category-browse')).toBeTruthy();
    expect(screen.queryByTestId('category-crumb')).toBeNull();
    expect(onStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ categoryId: null }));
  });

  it('opens All products under the crumb', () => {
    render(<Catalogue {...props} categoryBrowse="tiles" />);
    fireEvent.click(screen.getByTestId('category-tile-all'));
    expect(within(screen.getByTestId('grid')).getAllByTestId(/^product-tile-/).map((tile) => tile.getAttribute('data-testid')))
      .toEqual(['product-tile-Blue Hat', 'product-tile-Red Shirt', 'product-tile-Hat and Shirt']);
    expect(within(screen.getByTestId('category-crumb')).getByText('All products')).toBeTruthy();
    fireEvent.click(screen.getByTestId('category-crumb-root'));
    expect(screen.getByTestId('category-browse')).toBeTruthy();
    expect(screen.queryByTestId('category-crumb')).toBeNull();
  });

  it('searches every product from the root', () => {
    render(<Catalogue {...props} categoryBrowse="tiles" />);
    fireEvent.change(screen.getByPlaceholderText('Search or scan barcode / SKU'), { target: { value: 'hat' } });
    expect(screen.queryByTestId('category-browse')).toBeNull();
    expect(within(screen.getByTestId('grid')).getAllByTestId(/^product-tile-/).map((tile) => tile.getAttribute('data-testid')))
      .toEqual(['product-tile-Blue Hat', 'product-tile-Hat and Shirt']);
    expect(screen.queryByTestId('category-crumb')).toBeNull();
  });

  it('opens a stored category straight away', () => {
    render(<Catalogue {...props} categoryBrowse="tiles" loadViewState={() => ({ categoryId: 'pcat_shirts' })} />);
    expect(screen.queryByTestId('category-browse')).toBeNull();
    expect(within(screen.getByTestId('grid')).getAllByTestId(/^product-tile-/).map((tile) => tile.getAttribute('data-testid')))
      .toEqual(['product-tile-Red Shirt', 'product-tile-Hat and Shirt']);
    expect(within(screen.getByTestId('category-crumb')).getByText('Shirts')).toBeTruthy();
  });
});
