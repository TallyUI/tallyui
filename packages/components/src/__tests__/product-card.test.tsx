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

  it('shows a muted "Not sold here" state and ignores a press for an unsellable product', () => {
    const onPress = vi.fn();
    const connector = createTestConnector('medusa');
    render(
      <ConnectorProvider connector={connector}>
        <ProductCard doc={{ ...medusaDoc, status: 'draft' }} onPress={onPress} />
      </ConnectorProvider>
    );
    expect(screen.getByText('Not sold here')).toBeDefined();
    const card = screen.getByText('Not sold here').closest('[aria-disabled]');
    expect(card).not.toBeNull();
    fireEvent.click(card!);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows a custom notSoldLabel for an unsellable product', () => {
    const connector = createTestConnector('medusa');
    render(
      <ConnectorProvider connector={connector}>
        <ProductCard doc={{ ...medusaDoc, status: 'draft' }} notSoldLabel="Unavailable" />
      </ConnectorProvider>
    );
    expect(screen.getByText('Unavailable')).toBeDefined();
  });

  it('renders a sellable card unchanged', () => {
    const connector = createTestConnector('medusa');
    render(
      <ConnectorProvider connector={connector}>
        <ProductCard doc={{ ...medusaDoc, status: 'published' }} />
      </ConnectorProvider>
    );
    expect(screen.queryByText('Not sold here')).toBeNull();
    expect(screen.getByText(medusaDoc.title)).toBeDefined();
  });
});
