import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectorProvider } from '@tallyui/core';
import { ProductTitle } from '../product/product-title';
import { createTestConnector, wooDoc, medusaDoc } from './helpers';

describe('ProductTitle', () => {
  it('renders the WooCommerce product name', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <ProductTitle doc={wooDoc} />
      </ConnectorProvider>
    );
    expect(screen.getByText('Espresso Machine Pro')).toBeDefined();
  });

  it('renders the Medusa product title', () => {
    const connector = createTestConnector('medusa');
    render(
      <ConnectorProvider connector={connector}>
        <ProductTitle doc={medusaDoc} />
      </ConnectorProvider>
    );
    expect(screen.getByText('Commercial Espresso Machine')).toBeDefined();
  });

  it('renders empty string gracefully for missing name', () => {
    const connector = createTestConnector('woo');
    const { container } = render(
      <ConnectorProvider connector={connector}>
        <ProductTitle doc={{}} />
      </ConnectorProvider>
    );
    // Should render without crashing
    expect(container).toBeDefined();
  });
});
