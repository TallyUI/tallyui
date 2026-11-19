import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MoneyFormatProvider } from '@tallyui/core';
import { CartTotal } from '../cart/cart-total';

const money = { amount: 123450, currency: 'EUR' };

describe('money format wiring', () => {
  it('renders cart totals with the store format', () => {
    render(<MoneyFormatProvider locale="en" format={{ position: 'right_space', thousandSeparator: '.', decimalSeparator: ',', symbol: '€' }}>
      <CartTotal subtotal={money} total={money} locale="en" />
    </MoneyFormatProvider>);
    expect(screen.getAllByText('1.234,50 €').length).toBe(2);
  });

  it('keeps the existing cart total format without a provider', () => {
    render(<CartTotal subtotal={money} total={money} locale="en" />);
    expect(screen.getAllByText('€1,234.50').length).toBe(2);
  });
});
