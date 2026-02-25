import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectorProvider } from '@tallyui/core';
import { CartTotal } from '../cart/cart-total';
import { createTestConnector, wooDoc } from './helpers';

const cartItems = [
  { doc: wooDoc, quantity: 2 },
  { doc: { ...wooDoc, name: 'Milk Frother', price: '49.99' }, quantity: 1 },
];

describe('CartTotal', () => {
  it('renders subtotal and total labels', () => {
    const connector = createTestConnector('woo');
    const { container } = render(
      <ConnectorProvider connector={connector}>
        <CartTotal items={cartItems} />
      </ConnectorProvider>
    );
    expect(screen.getByText('Subtotal')).toBeDefined();
    expect(screen.getByText('Total')).toBeDefined();
    // subtotal and total both $1249.97 (no tax), so 2 elements
    expect(screen.getAllByText('$1249.97')).toHaveLength(2);
  });

  it('renders tax when taxRate is provided', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <CartTotal items={cartItems} taxRate={0.1} />
      </ConnectorProvider>
    );
    expect(screen.getByText('Tax')).toBeDefined();
    expect(screen.getByText('$125.00')).toBeDefined();
    expect(screen.getByText('$1374.97')).toBeDefined();
  });

  it('uses custom currency symbol and tax label', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <CartTotal items={cartItems} currencySymbol="€" taxRate={0.2} taxLabel="VAT" />
      </ConnectorProvider>
    );
    expect(screen.getByText('VAT')).toBeDefined();
    // Multiple euro amounts present — just check at least one exists
    expect(screen.getAllByText(/€/).length).toBeGreaterThan(0);
  });

  it('handles empty cart', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <CartTotal items={[]} />
      </ConnectorProvider>
    );
    // subtotal and total both $0.00
    expect(screen.getAllByText('$0.00')).toHaveLength(2);
  });
});
