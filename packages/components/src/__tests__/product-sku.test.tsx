import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectorProvider } from '@tallyui/core';
import { ProductSku } from '../product/product-sku';
import { createTestConnector, wooDoc, medusaDoc } from './helpers';

describe('ProductSku', () => {
  it('renders WooCommerce SKU', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <ProductSku doc={wooDoc} />
      </ConnectorProvider>
    );
    expect(screen.getByText('EQ-ESP-001')).toBeDefined();
  });

  it('renders Medusa SKU from variant', () => {
    const connector = createTestConnector('medusa');
    render(
      <ConnectorProvider connector={connector}>
        <ProductSku doc={medusaDoc} />
      </ConnectorProvider>
    );
    expect(screen.getByText('EQ-ESP-001')).toBeDefined();
  });

  it('renders fallback when SKU is missing', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <ProductSku doc={{}} />
      </ConnectorProvider>
    );
    expect(screen.getByText('—')).toBeDefined();
  });

  it('renders custom fallback text', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <ProductSku doc={{}} fallback="N/A" />
      </ConnectorProvider>
    );
    expect(screen.getByText('N/A')).toBeDefined();
  });
});
