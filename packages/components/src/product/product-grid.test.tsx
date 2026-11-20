import { cleanup, render, screen, within } from '@testing-library/react';
import { Text, View } from 'react-native';
import { afterEach, describe, expect, it } from 'vitest';
import { ProductGrid } from './product-grid';

const items = Array.from({ length: 2000 }, (_, i) => ({ id: 'p' + i }));
const renderItem = (item: { id: string }) => <View testID={'tile-' + item.id} />;

afterEach(() => cleanup());

describe('ProductGrid', () => {
  it.each([undefined, 6])('bounds the initial render with numColumns=%s', (numColumns) => {
    render(<ProductGrid items={items} renderItem={renderItem} numColumns={numColumns} />);

    expect(screen.queryAllByTestId(/^tile-/).length).toBeLessThan(200);
    expect(screen.getByTestId('tile-p0')).toBeDefined();
  });

  it('renders emptyState without tiles when items is empty', () => {
    render(
      <ProductGrid items={[]} renderItem={renderItem} emptyState={<Text>No products</Text>} />
    );

    expect(screen.getByText('No products')).toBeDefined();
    expect(screen.queryAllByTestId(/^tile-/)).toHaveLength(0);
  });

  it('renders searchSlot above the list', () => {
    render(
      <ProductGrid
        items={items}
        renderItem={renderItem}
        searchSlot={<Text>Search products</Text>}
      />
    );

    const search = screen.getByText('Search products');
    const firstTile = screen.getByTestId('tile-p0');
    expect(search.compareDocumentPosition(firstTile) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  const three = items.slice(0, 3);

  it('renders footerSlot inside the list after the last tile', () => {
    render(<ProductGrid items={three} renderItem={renderItem} footerSlot={<Text testID="grid-end">End</Text>} />);

    const footer = within(screen.getByTestId('product-grid-list')).getByTestId('grid-end');
    const lastTile = screen.getByTestId('tile-p2');
    expect(lastTile.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not render footerSlot with emptyState', () => {
    render(
      <ProductGrid
        items={[]}
        renderItem={renderItem}
        emptyState={<Text>No products</Text>}
        footerSlot={<Text testID="grid-end">End</Text>}
      />
    );

    expect(screen.getByText('No products')).toBeDefined();
    expect(screen.queryByTestId('grid-end')).toBeNull();
  });

  it('renders no footer node without footerSlot', () => {
    render(<ProductGrid items={three} renderItem={renderItem} />);

    const nodes = screen.getByTestId('product-grid-list').querySelectorAll('*');
    expect(nodes[nodes.length - 1]).toBe(screen.getByTestId('tile-p2'));
  });
});
