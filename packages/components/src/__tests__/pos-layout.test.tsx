import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Text } from 'react-native';
import { POSLayout } from '../layout/pos-layout';

describe('POSLayout', () => {
  it('renders both slots in split mode', () => {
    render(
      <POSLayout layout="split" browseSlot={<Text>Products</Text>} cartSlot={<Text>Cart</Text>} />,
    );
    expect(screen.getByText('Products')).toBeDefined();
    expect(screen.getByText('Cart')).toBeDefined();
  });

  it('renders header slot', () => {
    render(
      <POSLayout layout="split" browseSlot={<Text>Products</Text>} cartSlot={<Text>Cart</Text>} headerSlot={<Text>POS Header</Text>} />,
    );
    expect(screen.getByText('POS Header')).toBeDefined();
  });

  it('renders stacked mode with tab navigation', () => {
    render(
      <POSLayout layout="stacked" browseSlot={<Text>Products</Text>} cartSlot={<Text>Cart Items</Text>} />,
    );
    expect(screen.getByText('Browse')).toBeDefined();
    expect(screen.getByText('Products')).toBeDefined();
  });

  it('switches tabs in stacked mode', () => {
    render(
      <POSLayout layout="stacked" browseSlot={<Text>Products</Text>} cartSlot={<Text>Cart Items</Text>} />,
    );
    fireEvent.click(screen.getByText('Cart'));
    expect(screen.getByText('Cart Items')).toBeDefined();
  });
});
