import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConnectorProvider } from '@tallyui/core';
import { ProductCard } from '../product/product-card';
import { createTestConnector, wooDoc } from './helpers';

describe('ProductCard', () => {
  it('renders product name and price', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <ProductCard doc={wooDoc} />
      </ConnectorProvider>
    );
    expect(screen.getByText('Espresso Machine Pro')).toBeDefined();
    expect(screen.getByText('$599.99')).toBeDefined();
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
