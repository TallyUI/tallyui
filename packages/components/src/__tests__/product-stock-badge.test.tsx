import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectorProvider } from '@tallyui/core';
import { ProductStockBadge } from '../product/product-stock-badge';
import { createTestConnector, wooDoc, medusaDoc } from './helpers';
import { createVendureConnector } from '@tallyui/connector-vendure';

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

  it('omits the quantity for out-of-stock products even when showQuantity is true', () => {
    const connector = createTestConnector('woo');
    const outOfStockDoc = { ...wooDoc, stock_status: 'outofstock', stock_quantity: 0 };
    render(
      <ConnectorProvider connector={connector}>
        <ProductStockBadge doc={outOfStockDoc} showQuantity />
      </ConnectorProvider>
    );
    expect(screen.getByText('Out of Stock').textContent).toBe('Out of Stock');
  });

  it('shows quantity when showQuantity is true', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <ProductStockBadge doc={wooDoc} showQuantity />
      </ConnectorProvider>
    );
    expect(screen.getByText('In Stock (12)')).toBeDefined();
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

  it('renders "On Backorder" for a Medusa variant with none left that allows backorders', () => {
    const connector = createTestConnector('medusa');
    const variant = { ...medusaDoc.variants[0], manage_inventory: true, allow_backorder: true, inventory_quantity: 0 };
    render(
      <ConnectorProvider connector={connector}>
        <ProductStockBadge doc={{ ...medusaDoc, variants: [variant] }} showQuantity />
      </ConnectorProvider>
    );
    expect(screen.getByText('On Backorder (0)')).toBeDefined();
  });

  describe('with a reconciled stock overlay', () => {
    const level = (stockOnHand: number) => ({ stockLocationId: '1', stockOnHand, stockAllocated: 0 });
    const vendureDoc = { id: 'p1', name: 'Mug', variants: [{ id: 'v1', stockLevels: [level(5)] }, { id: 'v2', stockLevels: [level(2)] }] };
    const overlay = new Map([['v1', [level(10)]]]);
    const renderBadge = (props: { showAsOf?: boolean }, stockOverlay?: Map<string, unknown>, asOf?: string) => render(
      <ConnectorProvider connector={createVendureConnector()} stockOverlay={stockOverlay} stockOverlayAsOf={asOf}>
        <ProductStockBadge doc={vendureDoc} showQuantity {...props} />
      </ConnectorProvider>
    ).container.textContent;

    it('shows the overlay quantity and when it was confirmed', () => {
      const today = new Date().toISOString();
      const time = new Date(today).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      expect(renderBadge({}, overlay, today)).toBe(`In Stock (12) · as of ${time}`);
      const old = '2020-01-02T12:00:00.000Z';
      const date = new Date(old).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      expect(renderBadge({}, overlay, old)).toBe(`In Stock (12) · as of ${date}`);
    });

    it('hides the time with showAsOf={false}', () => {
      expect(renderBadge({ showAsOf: false }, overlay, new Date().toISOString())).toBe('In Stock (12)');
    });

    it('renders as before without an overlay', () => {
      expect(renderBadge({})).toBe('In Stock (7)');
      expect(renderBadge({}, undefined, new Date().toISOString())).toBe('In Stock (7)');
    });
  });
});
