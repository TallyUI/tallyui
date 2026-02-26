import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { CheckoutLayout } from '../layout/checkout-layout';

describe('CheckoutLayout', () => {
  it('renders both slots in split mode', () => {
    render(
      <CheckoutLayout layout="split" summarySlot={<Text>Order Summary</Text>} paymentSlot={<Text>Payment</Text>} />,
    );
    expect(screen.getByText('Order Summary')).toBeDefined();
    expect(screen.getByText('Payment')).toBeDefined();
  });

  it('renders stacked mode with both slots visible', () => {
    render(
      <CheckoutLayout layout="stacked" summarySlot={<Text>Order Summary</Text>} paymentSlot={<Text>Payment</Text>} />,
    );
    expect(screen.getByText('Order Summary')).toBeDefined();
    expect(screen.getByText('Payment')).toBeDefined();
  });

  it('renders header slot', () => {
    render(
      <CheckoutLayout layout="split" summarySlot={<Text>Summary</Text>} paymentSlot={<Text>Pay</Text>} headerSlot={<Text>Checkout</Text>} />,
    );
    expect(screen.getByText('Checkout')).toBeDefined();
  });
});
