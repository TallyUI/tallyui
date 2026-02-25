import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectorProvider } from '@tallyui/core';
import { CartLine } from '../cart/cart-line';
import { createTestConnector, wooDoc, medusaDoc } from './helpers';

describe('CartLine', () => {
  it('renders product name and line total for WooCommerce', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <CartLine item={{ doc: wooDoc, quantity: 2 }} />
      </ConnectorProvider>
    );
    expect(screen.getByText('Espresso Machine Pro')).toBeDefined();
    expect(screen.getByText('$1299.00 × 2')).toBeDefined();
    expect(screen.getByText('$2598.00')).toBeDefined();
  });

  it('renders product name and line total for Medusa', () => {
    const connector = createTestConnector('medusa');
    render(
      <ConnectorProvider connector={connector}>
        <CartLine item={{ doc: medusaDoc, quantity: 1 }} />
      </ConnectorProvider>
    );
    expect(screen.getByText('Espresso Machine Pro')).toBeDefined();
    expect(screen.getByText('$1299.00 × 1')).toBeDefined();
    expect(screen.getByText('$1299.00')).toBeDefined();
  });

  it('renders custom currency symbol', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <CartLine item={{ doc: wooDoc, quantity: 1 }} currencySymbol="€" />
      </ConnectorProvider>
    );
    expect(screen.getByText('€1299.00 × 1')).toBeDefined();
    expect(screen.getByText('€1299.00')).toBeDefined();
  });

  it('handles missing price gracefully', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <CartLine item={{ doc: {}, quantity: 3 }} />
      </ConnectorProvider>
    );
    expect(screen.getByText('× 3')).toBeDefined();
    expect(screen.getByText('—')).toBeDefined();
  });
});
