import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { OrderDetail } from '../order/order-detail';

describe('OrderDetail', () => {
  const lineItems = [{ name: 'Widget', quantity: 2, total: '20.00' }];

  it('renders order number and status', () => {
    render(
      <OrderDetail orderNumber="#1042" status="completed" lineItems={lineItems} subtotal="20.00" tax="2.00" total="22.00" />,
    );
    expect(screen.getByText('#1042')).toBeDefined();
    expect(screen.getByText('Completed')).toBeDefined();
  });

  it('renders line items', () => {
    render(
      <OrderDetail orderNumber="#1042" status="completed" lineItems={lineItems} subtotal="20.00" tax="2.00" total="22.00" />,
    );
    expect(screen.getByText('Widget x2')).toBeDefined();
  });

  it('renders custom sections via slots', () => {
    render(
      <OrderDetail
        orderNumber="#1042"
        status="completed"
        lineItems={lineItems}
        subtotal="20.00"
        tax="2.00"
        total="22.00"
        customerSlot={<Text>Jane Smith</Text>}
        paymentSlot={<Text>Paid with Cash</Text>}
      />,
    );
    expect(screen.getByText('Jane Smith')).toBeDefined();
    expect(screen.getByText('Paid with Cash')).toBeDefined();
  });
});
