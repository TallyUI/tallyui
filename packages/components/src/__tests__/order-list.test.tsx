import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { OrderList } from '../order/order-list';

describe('OrderList', () => {
  it('renders items using renderItem', () => {
    const items = [{ id: '1' }, { id: '2' }];
    render(
      <OrderList items={items} renderItem={(item) => <Text>Order {item.id}</Text>} />,
    );
    expect(screen.getByText('Order 1')).toBeDefined();
    expect(screen.getByText('Order 2')).toBeDefined();
  });

  it('renders empty state', () => {
    render(
      <OrderList items={[]} renderItem={() => <Text>nope</Text>} emptyState={<Text>No orders</Text>} />,
    );
    expect(screen.getByText('No orders')).toBeDefined();
  });
});
