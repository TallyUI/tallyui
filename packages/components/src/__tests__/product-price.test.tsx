import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectorProvider } from '@tallyui/core';
import { ProductPrice } from '../product/product-price';
import { createTestConnector, wooDoc, medusaDoc } from './helpers';

describe('ProductPrice', () => {
  it('renders WooCommerce price with default $ symbol', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <ProductPrice doc={wooDoc} />
      </ConnectorProvider>
    );
    expect(screen.getByText('$1299.00')).toBeDefined();
  });

  it('formats a Medusa price in the currency the backend gives', () => {
    const connector = createTestConnector('medusa');
    render(
      <ConnectorProvider connector={connector}>
        <ProductPrice doc={medusaDoc} locale="en-US" />
      </ConnectorProvider>
    );
    expect(screen.getByText('$1,299.00')).toBeDefined();
  });

  it('uses the provider store currency for backends whose documents omit it', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector} traitContext={{ currency: 'EUR' }}>
        <ProductPrice doc={wooDoc} locale="en-US" />
      </ConnectorProvider>
    );
    expect(screen.getByText('€1,299.00')).toBeDefined();
  });

  it('shows a Medusa sale price list price with the base price it replaces', () => {
    const connector = createTestConnector('medusa');
    const variant = {
      ...medusaDoc.variants[0],
      prices: [{ amount: 20, currency_code: 'eur' }],
      calculated_price: {
        currency_code: 'eur',
        calculated_amount: 16,
        calculated_price: { price_list_type: 'sale' },
      },
    };
    render(
      <ConnectorProvider connector={connector}>
        <ProductPrice doc={{ ...medusaDoc, variants: [variant] }} locale="en-US" />
      </ConnectorProvider>
    );
    expect(screen.getByText('€16.00 (was €20.00)')).toBeDefined();
  });

  it('renders custom currency symbol', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <ProductPrice doc={wooDoc} currencySymbol="€" />
      </ConnectorProvider>
    );
    expect(screen.getByText('€1299.00')).toBeDefined();
  });

  it('renders dash when price is missing', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <ProductPrice doc={{}} />
      </ConnectorProvider>
    );
    expect(screen.getByText('-')).toBeDefined();
  });

  it('shows sale price with "was" indicator for on-sale WooCommerce product', () => {
    const connector = createTestConnector('woo');
    const saleDoc = {
      ...wooDoc,
      price: '499.99',
      sale_price: '499.99',
      regular_price: '599.99',
      on_sale: true,
    };
    render(
      <ConnectorProvider connector={connector}>
        <ProductPrice doc={saleDoc} />
      </ConnectorProvider>
    );
    // The component should show the sale price and "was" regular price
    const el = screen.getByText(/499\.99/);
    expect(el).toBeDefined();
    expect(el.textContent).toContain('was');
    expect(el.textContent).toContain('599.99');
  });
});
