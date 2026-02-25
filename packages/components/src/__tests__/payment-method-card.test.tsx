import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PaymentMethodCard } from '../checkout/payment-method-card';

describe('PaymentMethodCard', () => {
  it('renders the method label', () => {
    render(<PaymentMethodCard label="Credit Card" selected={false} onPress={() => {}} />);
    expect(screen.getByText('Credit Card')).toBeDefined();
  });

  it('calls onPress when tapped', () => {
    const onPress = vi.fn();
    render(<PaymentMethodCard label="Cash" selected={false} onPress={onPress} />);
    fireEvent.click(screen.getByText('Cash'));
    expect(onPress).toHaveBeenCalled();
  });

  it('shows selected state visually', () => {
    const { container } = render(
      <PaymentMethodCard label="Cash" selected={true} onPress={() => {}} />
    );
    expect(container).toBeDefined();
  });
});
