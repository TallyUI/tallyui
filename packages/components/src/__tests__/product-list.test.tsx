import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { ProductList } from '../product/product-list';

describe('ProductList', () => {
  const items = [
    { id: '1', name: 'Widget' },
    { id: '2', name: 'Gadget' },
  ];

  it('renders items using renderItem', () => {
    render(
      <ProductList
        items={items}
        renderItem={(item) => <Text>{item.name}</Text>}
      />,
    );
    expect(screen.getByText('Widget')).toBeDefined();
    expect(screen.getByText('Gadget')).toBeDefined();
  });

  it('renders search slot', () => {
    render(
      <ProductList
        items={items}
        renderItem={(item) => <Text>{item.name}</Text>}
        searchSlot={<Text>Search here</Text>}
      />,
    );
    expect(screen.getByText('Search here')).toBeDefined();
  });

  it('renders empty state when no items', () => {
    render(
      <ProductList
        items={[]}
        renderItem={() => <Text>nope</Text>}
        emptyState={<Text>No products found</Text>}
      />,
    );
    expect(screen.getByText('No products found')).toBeDefined();
  });
});
