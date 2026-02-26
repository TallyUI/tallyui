import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Text } from 'react-native';
import { CartLineActions } from '../cart/cart-line-actions';

describe('CartLineActions', () => {
  const actions = [
    { id: 'delete', label: 'Delete', onPress: vi.fn() },
    { id: 'discount', label: 'Discount', onPress: vi.fn() },
  ];

  it('renders children content', () => {
    render(
      <CartLineActions actions={actions}>
        <Text>Product A</Text>
      </CartLineActions>,
    );
    expect(screen.getByText('Product A')).toBeDefined();
  });

  it('renders action buttons', () => {
    render(
      <CartLineActions actions={actions}>
        <Text>Product A</Text>
      </CartLineActions>,
    );
    expect(screen.getByText('Delete')).toBeDefined();
    expect(screen.getByText('Discount')).toBeDefined();
  });

  it('calls action onPress when button is tapped', () => {
    render(
      <CartLineActions actions={actions}>
        <Text>Product A</Text>
      </CartLineActions>,
    );
    fireEvent.click(screen.getByText('Delete'));
    expect(actions[0].onPress).toHaveBeenCalled();
  });
});
