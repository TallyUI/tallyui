import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
    const price = screen.getByText('€1,299.00');
    expect(price.style.fontVariant).toBe('tabular-nums');
  });

  it('merges tabular numerals with caller text styles', () => {
    const connector = createTestConnector('woo');
    render(
      <ConnectorProvider connector={connector}>
        <ProductPrice doc={wooDoc} style={[{ marginTop: 3 }, { marginBottom: 5 }]} />
      </ConnectorProvider>
    );
    const price = screen.getByText('$1299.00');
    expect(price.style.fontVariant).toBe('tabular-nums');
    expect(price.style.marginTop).toBe('3px');
    expect(price.style.marginBottom).toBe('5px');
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
    const price = screen.getByText(/€16\.00/);
    expect(price.textContent).toBe('€16.00 (was €20.00)');
    const was = screen.getByText('(was €20.00)');
    expect(was.style.textDecoration).toContain('line-through');
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

  it('shows "from" the lowest price when variant prices differ', () => {
    const connector = createTestConnector('medusa');
    const variants = [
      { ...medusaDoc.variants[0], id: 'var-1', prices: [{ amount: 10, currency_code: 'eur' }] },
      { ...medusaDoc.variants[0], id: 'var-2', prices: [{ amount: 11, currency_code: 'eur' }] },
    ];
    render(
      <ConnectorProvider connector={connector}>
        <ProductPrice doc={{ ...medusaDoc, variants }} locale="en-US" />
      </ConnectorProvider>
    );
    expect(screen.getByText('from €10.00')).toBeDefined();
  });

  it('renders the default variant\'s price when showFromPrice is false', () => {
    const connector = createTestConnector('medusa');
    const variants = [
      { ...medusaDoc.variants[0], id: 'var-1', prices: [{ amount: 10, currency_code: 'eur' }] },
      { ...medusaDoc.variants[0], id: 'var-2', prices: [{ amount: 11, currency_code: 'eur' }] },
    ];
    render(
      <ConnectorProvider connector={connector}>
        <ProductPrice doc={{ ...medusaDoc, variants }} locale="en-US" showFromPrice={false} />
      </ConnectorProvider>
    );
    expect(screen.getByText('€10.00')).toBeDefined();
  });

  it('uses a custom fromLabel', () => {
    const connector = createTestConnector('medusa');
    const variants = [
      { ...medusaDoc.variants[0], id: 'var-1', prices: [{ amount: 10, currency_code: 'eur' }] },
      { ...medusaDoc.variants[0], id: 'var-2', prices: [{ amount: 11, currency_code: 'eur' }] },
    ];
    render(
      <ConnectorProvider connector={connector}>
        <ProductPrice doc={{ ...medusaDoc, variants }} locale="en-US" fromLabel="ab" />
      </ConnectorProvider>
    );
    expect(screen.getByText('ab €10.00')).toBeDefined();
  });

  it('uses formatFrom for a price-after word order', () => {
    const connector = createTestConnector('medusa');
    const variants = [
      { ...medusaDoc.variants[0], id: 'var-1', prices: [{ amount: 10, currency_code: 'eur' }] },
      { ...medusaDoc.variants[0], id: 'var-2', prices: [{ amount: 11, currency_code: 'eur' }] },
    ];
    render(
      <ConnectorProvider connector={connector}>
        <ProductPrice doc={{ ...medusaDoc, variants }} locale="en-US" formatFrom={(p) => `${p} ab`} />
      </ConnectorProvider>
    );
    expect(screen.getByText('€10.00 ab')).toBeDefined();
  });

  it('prefers formatFrom over fromLabel when both are given', () => {
    const connector = createTestConnector('medusa');
    const variants = [
      { ...medusaDoc.variants[0], id: 'var-1', prices: [{ amount: 10, currency_code: 'eur' }] },
      { ...medusaDoc.variants[0], id: 'var-2', prices: [{ amount: 11, currency_code: 'eur' }] },
    ];
    render(
      <ConnectorProvider connector={connector}>
        <ProductPrice doc={{ ...medusaDoc, variants }} locale="en-US" fromLabel="ab" formatFrom={(p) => `${p} zu`} />
      </ConnectorProvider>
    );
    expect(screen.getByText('€10.00 zu')).toBeDefined();
  });

  it('shows the range even when the default variant has no price in that currency', () => {
    const connector = createTestConnector('medusa');
    const variants = [
      { ...medusaDoc.variants[0], id: 'var-0', prices: [{ amount: 5, currency_code: 'usd' }] },
      { ...medusaDoc.variants[0], id: 'var-1', prices: [{ amount: 10, currency_code: 'eur' }] },
      { ...medusaDoc.variants[0], id: 'var-2', prices: [{ amount: 11, currency_code: 'eur' }] },
    ];
    render(
      <ConnectorProvider connector={connector} traitContext={{ currency: 'EUR' }}>
        <ProductPrice doc={{ ...medusaDoc, variants }} locale="en-US" />
      </ConnectorProvider>
    );
    expect(screen.getByText('from €10.00')).toBeDefined();
  });

  it('renders the shared price with no "from" when variants match', () => {
    const connector = createTestConnector('medusa');
    const variants = [
      { ...medusaDoc.variants[0], id: 'var-1', prices: [{ amount: 10, currency_code: 'eur' }] },
      { ...medusaDoc.variants[0], id: 'var-2', prices: [{ amount: 10, currency_code: 'eur' }] },
    ];
    render(
      <ConnectorProvider connector={connector}>
        <ProductPrice doc={{ ...medusaDoc, variants }} locale="en-US" />
      </ConnectorProvider>
    );
    expect(screen.getByText('€10.00')).toBeDefined();
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

  it('uses the theme price token for regular and range prices, and the sale token for the sale price', () => {
    // react-native-web atomizes className into a hashed class at render time, so the
    // Tailwind class names aren't present on the rendered DOM node (see theme-classes.test.ts
    // for this codebase's convention of asserting class names from source instead).
    const source = readFileSync(join(process.cwd(), 'packages/components/src/product/product-price.tsx'), 'utf8');
    expect(source).not.toMatch(/text-foreground/);
    expect(source.match(/text-price/g)?.length).toBe(2);
    expect(source).toContain('text-sale');
  });
});
