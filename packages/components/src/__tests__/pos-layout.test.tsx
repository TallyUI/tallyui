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

  describe('renderCheckout (v2 pos-columns.tsx:118-162)', () => {
    const browse = <Text testID="browse-pane">Products</Text>;
    const cart = <Text testID="cart-pane">Cart Items</Text>;

    it('T1: split swaps the browse column for the checkout column and keeps the cart', () => {
      const renderCheckout = vi.fn(() => <Text testID="checkout-pane">Tender</Text>);
      render(<POSLayout layout="split" browseSlot={browse} cartSlot={cart} renderCheckout={renderCheckout} />);
      const column = screen.getByTestId('pos-checkout-column');
      expect(column.contains(screen.getByTestId('checkout-pane'))).toBe(true);
      expect(screen.queryByTestId('browse-pane')).toBeNull();
      expect(screen.getByTestId('cart-pane')).toBeDefined();
      expect(renderCheckout).toHaveBeenCalledWith('split');
    });

    it.each(['top', 'bottom'] as const)('T2: stacked (tabBar=%s) is the checkout column alone, with no tabs', (tabBar) => {
      const renderCheckout = vi.fn(() => <Text testID="checkout-pane">Tender</Text>);
      render(<POSLayout layout="stacked" tabBar={tabBar} browseSlot={browse} cartSlot={cart} renderCheckout={renderCheckout} />);
      const column = screen.getByTestId('pos-checkout-column');
      expect(column.contains(screen.getByTestId('checkout-pane'))).toBe(true);
      expect(renderCheckout).toHaveBeenCalledWith('stacked');
      expect(renderCheckout).not.toHaveBeenCalledWith('split');
      expect(screen.queryByText('Browse')).toBeNull();
      expect(screen.queryByText('Cart')).toBeNull();
      expect(screen.queryByTestId('pos-tab-bar')).toBeNull();
      expect(screen.queryByTestId('pos-tab-products')).toBeNull();
      expect(screen.queryByTestId('pos-tab-cart')).toBeNull();
      expect(screen.queryByTestId('browse-pane')).toBeNull();
      expect(screen.queryByTestId('cart-pane')).toBeNull();
    });

    it.each(['split', 'stacked'] as const)('T3: the header still renders with renderCheckout (%s)', (layout) => {
      render(<POSLayout layout={layout} browseSlot={browse} cartSlot={cart} headerSlot={<Text>POS Header</Text>}
        renderCheckout={() => <Text>Tender</Text>} />);
      expect(screen.getByText('POS Header')).toBeDefined();
      expect(screen.getByTestId('pos-checkout-column')).toBeDefined();
    });

    it.each([
      ['split', 'top'], ['stacked', 'top'], ['stacked', 'bottom'],
    ] as const)('T4: without renderCheckout there is no checkout column (%s, %s)', (layout, tabBar) => {
      render(<POSLayout layout={layout} tabBar={tabBar} browseSlot={browse} cartSlot={cart} />);
      expect(screen.queryByTestId('pos-checkout-column')).toBeNull();
      expect(screen.getByTestId('browse-pane')).toBeDefined();
    });
  });
});
