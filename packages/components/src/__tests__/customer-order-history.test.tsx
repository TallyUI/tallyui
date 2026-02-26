import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { CustomerOrderHistory } from '../customer/customer-order-history';

describe('CustomerOrderHistory', () => {
  it('renders orders using renderItem', () => {
    const orders = [{ id: '1' }, { id: '2' }];
    render(
      <CustomerOrderHistory
        orders={orders}
        renderItem={(order) => <Text>Order {order.id}</Text>}
      />,
    );
    expect(screen.getByText('Order 1')).toBeDefined();
    expect(screen.getByText('Order 2')).toBeDefined();
  });

  it('renders empty state', () => {
    render(
      <CustomerOrderHistory
        orders={[]}
        renderItem={() => <Text>nope</Text>}
        emptyState={<Text>No order history</Text>}
      />,
    );
    expect(screen.getByText('No order history')).toBeDefined();
  });

  it('renders title', () => {
    render(
      <CustomerOrderHistory orders={[]} renderItem={() => <Text>x</Text>} />,
    );
    expect(screen.getByText('Order History')).toBeDefined();
  });
});
