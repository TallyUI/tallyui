import { cleanup, render, screen } from '@testing-library/react';
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
});
