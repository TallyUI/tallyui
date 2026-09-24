import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConnectorProvider, formatMoney } from '@tallyui/core';
import { ProductCard } from '../product/product-card';
import { createTestConnector, medusaDoc, wooDoc } from './helpers';

describe('ProductCard', () => {
  it('renders product name and price', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <ProductCard doc={wooDoc} />
      </ConnectorProvider>
    );
    expect(screen.getByText('Espresso Machine Pro')).toBeDefined();
    expect(screen.getByText('$1299.00')).toBeDefined();
  });

  it('shows "from" the lowest price for a product with differing variant prices', () => {
    const connector = createTestConnector('medusa');
    const variants = [
      { ...medusaDoc.variants[0], id: 'var-1', prices: [{ amount: 10, currency_code: 'eur' }] },
      { ...medusaDoc.variants[0], id: 'var-2', prices: [{ amount: 11, currency_code: 'eur' }] },
    ];
    render(
      <ConnectorProvider connector={connector}>
        <ProductCard doc={{ ...medusaDoc, variants }} />
      </ConnectorProvider>
    );
    const price = formatMoney({ amount: 1000, currency: 'EUR' });
    expect(screen.getByText(`from ${price}`)).toBeDefined();
  });

  it('calls onPress when tapped', () => {
    const onPress = vi.fn();
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <ProductCard doc={wooDoc} onPress={onPress} />
      </ConnectorProvider>
    );
    // Click on the product name text element
    fireEvent.click(screen.getByText('Espresso Machine Pro'));
    expect(onPress).toHaveBeenCalled();
  });
});
