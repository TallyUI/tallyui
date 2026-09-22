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

  it('renders Medusa SKU for a single-variant product', () => {
    const connector = createTestConnector('medusa');
    render(
      <ConnectorProvider connector={connector}>
        <ProductSku doc={medusaDoc} />
      </ConnectorProvider>
    );
    expect(screen.getByText('EQ-ESP-001')).toBeDefined();
  });

  it('renders the variant count for a multi-variant Medusa product', () => {
    const connector = createTestConnector('medusa');
    const doc = { ...medusaDoc, variants: [{ sku: 'FIRST' }, { sku: 'SECOND' }, { sku: 'THIRD' }] };
    render(
      <ConnectorProvider connector={connector}>
        <ProductSku doc={doc} />
      </ConnectorProvider>
    );
    expect(screen.getByText('3 variants')).toBeDefined();
    expect(screen.queryByText('FIRST')).toBeNull();
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
