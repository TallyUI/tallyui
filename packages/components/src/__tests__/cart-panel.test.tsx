import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { CartPanel } from '../cart/cart-panel';

const items = [{ name: 'Coffee' }, { name: 'Grinder' }];

describe('CartPanel', () => {
  it('renders generic items with their indices', () => {
    render(<CartPanel items={items} renderItem={(item, index) => <Text>{index}: {item.name}</Text>} />);
    expect(screen.getByText('0: Coffee')).toBeDefined();
    expect(screen.getByText('1: Grinder')).toBeDefined();
  });

  it('renders header and footer slots', () => {
    render(
      <CartPanel
        items={items}
        renderItem={(item) => <Text>{item.name}</Text>}
        header={<Text>Customer: Jane</Text>}
        footer={<Text>Total: €17.00</Text>}
      />
    );
    expect(screen.getByText('Customer: Jane')).toBeDefined();
    expect(screen.getByText('Total: €17.00')).toBeDefined();
  });

  it('renders emptyState when no items', () => {
    render(<CartPanel items={[]} renderItem={() => null} emptyState={<Text>Cart is empty</Text>} />);
    expect(screen.getByText('Cart is empty')).toBeDefined();
  });
});
