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

  it('bottom tabs keep both panes mounted and switch by tab', () => {
    render(
      <POSLayout layout="stacked" tabBar="bottom" browseSlot={<Text testID="browse-pane">Products</Text>} cartSlot={<Text testID="cart-pane">Cart Items</Text>} />,
    );
    expect(screen.getByTestId('browse-pane')).toBeDefined();
    expect(screen.getByTestId('cart-pane')).toBeDefined();
    fireEvent.click(screen.getByTestId('pos-tab-cart'));
    expect(screen.getByTestId('pos-tab-cart').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('pos-tab-products').getAttribute('aria-selected')).toBe('false');
    expect(screen.getByTestId('browse-pane')).toBeDefined();
  });

  it('the cart tab shows the count only above 0', () => {
    const { rerender } = render(
      <POSLayout layout="stacked" tabBar="bottom" cartCount={3} browseSlot={<Text>Products</Text>} cartSlot={<Text>Cart Items</Text>} />,
    );
    expect(screen.getByTestId('pos-tab-cart-count').textContent).toBe('3');
    rerender(<POSLayout layout="stacked" tabBar="bottom" cartCount={0} browseSlot={<Text>Products</Text>} cartSlot={<Text>Cart Items</Text>} />);
    expect(screen.queryByTestId('pos-tab-cart-count')).toBeNull();
  });

  it('top tabs are unchanged by default', () => {
    render(
      <POSLayout layout="stacked" browseSlot={<Text>Products</Text>} cartSlot={<Text>Cart Items</Text>} />,
    );
    expect(screen.getByText('Browse')).toBeDefined();
    expect(screen.queryByTestId('pos-tab-bar')).toBeNull();
  });
});
