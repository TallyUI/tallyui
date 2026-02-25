import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { OrderSummary } from '../checkout/order-summary';

describe('OrderSummary', () => {
  it('renders subtotal, tax, and total lines', () => {
    render(
      <OrderSummary subtotal="$1199.98" tax="$120.00" taxLabel="GST" total="$1319.98" />
    );
    expect(screen.getByText('Subtotal')).toBeDefined();
    expect(screen.getByText('$1199.98')).toBeDefined();
    expect(screen.getByText('GST')).toBeDefined();
    expect(screen.getByText('$120.00')).toBeDefined();
    expect(screen.getByText('Total')).toBeDefined();
    expect(screen.getByText('$1319.98')).toBeDefined();
  });

  it('renders header slot', () => {
    render(
      <OrderSummary subtotal="$100.00" total="$100.00" header={<Text>Customer: Jane</Text>} />
    );
    expect(screen.getByText('Customer: Jane')).toBeDefined();
  });

  it('renders payment info', () => {
    render(
      <OrderSummary subtotal="$100.00" total="$100.00" payments={[{ label: 'Cash', amount: '$100.00' }]} />
    );
    expect(screen.getByText('Cash')).toBeDefined();
  });
});
