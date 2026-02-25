import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ConnectorProvider } from '@tallyui/core';
import { ProductImage } from '../product/product-image';
import { createTestConnector, wooDoc, medusaDoc } from './helpers';

describe('ProductImage', () => {
  it('renders an image for WooCommerce product', () => {
    const connector = createTestConnector('woo');
    const { container } = render(
      <ConnectorProvider connector={connector}>
        <ProductImage doc={wooDoc} />
      </ConnectorProvider>
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://store.example/espresso.jpg');
  });

  it('renders an image for Medusa product (uses thumbnail)', () => {
    const connector = createTestConnector('medusa');
    const { container } = render(
      <ConnectorProvider connector={connector}>
        <ProductImage doc={medusaDoc} />
      </ConnectorProvider>
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://cdn.example/thumb-espresso.jpg');
  });

  it('renders nothing when no image URL is available', () => {
    const connector = createTestConnector('woo');
    const { container } = render(
      <ConnectorProvider connector={connector}>
        <ProductImage doc={{}} />
      </ConnectorProvider>
    );
    const img = container.querySelector('img');
    expect(img).toBeNull();
  });

  it('renders with custom size prop without crashing', () => {
    const connector = createTestConnector('woo');
    const { container } = render(
      <ConnectorProvider connector={connector}>
        <ProductImage doc={wooDoc} size={120} />
      </ConnectorProvider>
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://store.example/espresso.jpg');
  });
});
