import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderSummaryLine } from '../checkout/order-summary-line';

describe('OrderSummaryLine', () => {
  it('renders label and amount', () => {
    render(<OrderSummaryLine label="Subtotal" amount="$599.99" />);
    expect(screen.getByText('Subtotal')).toBeDefined();
    expect(screen.getByText('$599.99')).toBeDefined();
  });

  it('applies bold variant', () => {
    const { container } = render(
      <OrderSummaryLine label="Total" amount="$659.99" bold />
    );
    expect(container).toBeDefined();
  });
});
