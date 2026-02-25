import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectorProvider } from '@tallyui/core';
import { ProductStockBadge } from '../product/product-stock-badge';
import { createTestConnector, wooDoc, medusaDoc } from './helpers';

describe('ProductStockBadge', () => {
  it('renders "In Stock" for WooCommerce in-stock product', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <ProductStockBadge doc={wooDoc} />
      </ConnectorProvider>
    );
    expect(screen.getByText('In Stock')).toBeDefined();
  });

  it('renders "In Stock" for Medusa product with inventory', () => {
    const connector = createTestConnector('medusa');
    render(
      <ConnectorProvider connector={connector}>
        <ProductStockBadge doc={medusaDoc} />
      </ConnectorProvider>
    );
    expect(screen.getByText('In Stock')).toBeDefined();
  });

  it('renders "Out of Stock" for out-of-stock product', () => {
    const connector = createTestConnector('woo');
    const outOfStockDoc = { ...wooDoc, stock_status: 'outofstock', stock_quantity: 0 };
    render(
      <ConnectorProvider connector={connector}>
        <ProductStockBadge doc={outOfStockDoc} />
      </ConnectorProvider>
    );
    expect(screen.getByText('Out of Stock')).toBeDefined();
  });

  it('shows quantity when showQuantity is true', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <ProductStockBadge doc={wooDoc} showQuantity />
      </ConnectorProvider>
    );
    expect(screen.getByText('In Stock (15)')).toBeDefined();
  });

  it('renders "Unknown" when stock status is missing', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <ProductStockBadge doc={{}} />
      </ConnectorProvider>
    );
    expect(screen.getByText('Unknown')).toBeDefined();
  });
});
