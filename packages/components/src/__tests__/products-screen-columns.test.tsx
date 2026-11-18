import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { ConnectorProvider, type TallyConnector } from '@tallyui/core';
import { medusaConnector, medusaProductTraits } from '@tallyui/connector-medusa';
import { ProductTable } from '../product/product-table';
import { productsScreenColumns, useProductsScreenColumns } from '../product/products-screen-columns';

const price = [{ amount: 20, currency_code: 'eur' }];
const variant = (id: string, stock: Record<string, unknown>) => ({ id, title: id, sku: id.toUpperCase(), prices: price, ...stock });
const tracked = { id: 'tracked', title: 'Tracked', status: 'published', variants: [variant('t', { manage_inventory: true, inventory_quantity: 52 })] };
const untracked = { id: 'untracked', title: 'Untracked', status: 'published', variants: [variant('u', { manage_inventory: false })] };
const many = { id: 'many', title: 'Many', status: 'published',
  variants: Array.from({ length: 15 }, (_, i) => variant('m' + i, { manage_inventory: true, inventory_quantity: 1 })) };

function Table({ items }: { items: object[] }) {
  return <ProductTable items={items} columns={useProductsScreenColumns()} />;
}
const renderTable = (items: object[], connector: TallyConnector = medusaConnector) => render(
  <ConnectorProvider connector={connector} traitContext={{ currency: 'EUR' }}><Table items={items} /></ConnectorProvider>,
);
const row = (id: string) => within(screen.getByTestId('product-row-' + id));

afterEach(() => cleanup());

describe('productsScreenColumns', () => {
  it("lists v2's Products columns in order", () => {
    const columns = productsScreenColumns(medusaProductTraits);
    expect(columns.map((column) => column.id)).toEqual(['image', 'name', 'stock', 'stockStatus', 'category', 'price']);
    expect(columns.map((column) => column.header)).toEqual(['Image', 'Product', 'Stock', 'Stock Status', 'Categories', 'Price']);
    expect(columns.find((column) => column.id === 'image')?.hideHeader).toBe(true);
    expect(columns.find((column) => column.id === 'price')?.align).toBe('right');
  });

  it('Stock shows the quantity and a Manage switch that is on only when stock is tracked', () => {
    renderTable([tracked, untracked]);
    expect(row('tracked').getByTestId('product-stock-quantity').textContent).toBe('52');
    expect(row('untracked').getByTestId('product-stock-quantity').textContent).toBe('—');
    const on = row('tracked').getByRole('switch', { name: 'Manage' });
    const off = row('untracked').getByRole('switch', { name: 'Manage' });
    expect(on.getAttribute('aria-checked')).toBe('true');
    expect(off.getAttribute('aria-checked')).toBe('false');
    for (const toggle of [on, off]) expect(toggle.getAttribute('aria-disabled')).toBe('true');
  });

  it('Stock Status shows the badge without the quantity', () => {
    renderTable([tracked]);
    const status = row('tracked').getByTestId('product-stock-status');
    expect(status.textContent).toBe('In Stock');
    expect(status.textContent).not.toContain('52');
  });

  it('Product shows the variation count for a product with variants', () => {
    // Medusa calls one variant "no variants", so a connector that says otherwise draws the singular.
    const single = { id: 'single', title: 'Single', status: 'published', variants: [variant('s', { manage_inventory: false })] };
    const withVariants: TallyConnector = { ...medusaConnector, traits: { ...medusaConnector.traits,
      product: { ...medusaProductTraits, hasVariants: (doc) => doc.id !== 'untracked' } } };
    renderTable([many, single, untracked], withVariants);
    expect(row('many').getByTestId('product-variation-count').textContent).toBe('15 variations');
    expect(row('single').getByTestId('product-variation-count').textContent).toBe('1 variation');
    expect(row('untracked').queryByTestId('product-variation-count')).toBeNull();
  });

  it('sorts by name, stock, category and price, not by image or stock status', () => {
    const columns = productsScreenColumns(medusaProductTraits);
    expect(columns.filter((column) => column.sortValue).map((column) => column.id)).toEqual(['name', 'stock', 'category', 'price']);
    expect(columns.find((column) => column.id === 'stock')?.sortValue?.(tracked)).toBe(52);
  });
});
