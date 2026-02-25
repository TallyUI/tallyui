import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PaymentSelector } from '../checkout/payment-selector';

describe('PaymentSelector', () => {
  const methods = [
    { id: 'cash', label: 'Cash' },
    { id: 'card', label: 'Credit Card' },
  ];

  it('renders all payment methods', () => {
    render(<PaymentSelector methods={methods} selected="cash" onSelect={() => {}} />);
    expect(screen.getByText('Cash')).toBeDefined();
    expect(screen.getByText('Credit Card')).toBeDefined();
  });

  it('calls onSelect when a method is tapped', () => {
    const onSelect = vi.fn();
    render(<PaymentSelector methods={methods} selected="cash" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Credit Card'));
    expect(onSelect).toHaveBeenCalledWith('card');
  });
});
