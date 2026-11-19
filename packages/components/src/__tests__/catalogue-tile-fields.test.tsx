import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorProvider, type TallyConnector } from '@tallyui/core';
import { medusaConnector } from '@tallyui/connector-medusa';
import type { TileFields } from '@tallyui/pos';
import { Catalogue } from '../sale/catalogue';
import type { ProductGrid } from '../product';

// vendurepos gap 9.9b. Set up as catalogue.test.tsx (its grid and search mocks, copied), but the tile's words
// (ProductTitle, ProductPrice, ProductStockBadge) are the real components, inside a ConnectorProvider.
vi.mock('../product', async () => ({
  ...await vi.importActual<typeof import('../product')>('../product'),
  ProductGrid: ({ items, renderItem, emptyState }: ComponentProps<typeof ProductGrid>) => (
    <div data-testid="grid">
      {items.length ? items.map((item: { id: string }, index: number) => <div key={item.id}>{renderItem(item, index)}</div>) : emptyState}
    </div>
  ),
  ProductImage: () => null,
}));
vi.mock('../input', () => ({
  SearchInput: ({ value, onChangeText, placeholder }: { value: string; onChangeText: (text: string) => void; placeholder?: string }) => (
    <input value={value} placeholder={placeholder} onChange={(event) => onChangeText(event.target.value)} />
  ),
}));
vi.mock('../ui', async (importOriginal) => ({
  ...await importOriginal<typeof import('../ui')>(),
  VStack: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

const traits = medusaConnector.traits.product;
const products = [
  // On sale (priced mode: the calculated price carries the sale and the amount it replaces), with a SKU, a barcode
  // and two categories.
  { id: 'cap', title: 'Sale Cap', status: 'published', categories: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], variants: [
    { id: 'cap-one', title: 'One size', sku: 'CAP-1', barcode: '9990001', prices: [{ amount: 20, currency_code: 'eur' }],
      calculated_price: { currency_code: 'eur', calculated_amount: 16, original_amount: 20, calculated_price: { price_list_type: 'sale' } },
      manage_inventory: false },
  ] },
  // No SKU, no barcode, no categories.
  { id: 'mug', title: 'Plain Mug', status: 'published', variants: [
    { id: 'mug-one', title: 'One size', prices: [{ amount: 5, currency_code: 'eur' }], manage_inventory: false },
  ] },
  // Out of stock.
  { id: 'scarf', title: 'Gone Scarf', status: 'published', variants: [
    { id: 'scarf-one', title: 'One size', sku: 'SCARF-1', prices: [{ amount: 8, currency_code: 'eur' }], manage_inventory: true, inventory_quantity: 0 },
  ] },
];

afterEach(() => cleanup());

function mount(tileFields?: Partial<TileFields>) {
  render(
    <ConnectorProvider connector={medusaConnector as TallyConnector}>
      <Catalogue products={products} traits={traits} currency="EUR" onSelect={vi.fn()} lastSyncedAt={new Date()} tileFields={tileFields} />
    </ConnectorProvider>,
  );
}
const tile = (name: string) => screen.getByTestId(`product-tile-${name}`);
const text = (name: string) => tile(name).textContent ?? '';

describe('Catalogue tileFields', () => {
  it('T1: by default shows the title, the price with its was price and the stock, no SKU and no tile label', () => {
    mount();
    expect(text('Sale Cap')).toContain('Sale Cap');
    expect(text('Sale Cap')).toMatch(/16\.00/);
    expect(text('Sale Cap')).toMatch(/\(was .*20\.00\)/);
    expect(text('Sale Cap')).toContain('In Stock');
    expect(text('Sale Cap')).not.toContain('SKU');
    expect(tile('Sale Cap').getAttribute('aria-label')).toBeNull();
  });

  it('T2: with name off, the tile has no title text, keeps the name as its label and keeps its testID', () => {
    mount({ name: false });
    expect(text('Sale Cap')).not.toContain('Sale Cap');
    expect(tile('Sale Cap').getAttribute('aria-label')).toBe('Sale Cap');
    expect(tile('Sale Cap').getAttribute('data-testid')).toBe('product-tile-Sale Cap');
  });

  it('T3: with price off, no price shows', () => {
    mount({ price: false });
    expect(text('Sale Cap')).not.toMatch(/16\.00/);
    expect(text('Sale Cap')).not.toContain('(was');
    expect(text('Plain Mug')).not.toMatch(/5\.00/);
  });

  it('T4: with onSale off, the current price shows without the was price', () => {
    mount({ onSale: false });
    expect(text('Sale Cap')).toMatch(/16\.00/);
    expect(text('Sale Cap')).not.toContain('(was');
  });

  it('T5: SKU, barcode and categories show in that order; a product without a SKU shows no SKU', () => {
    mount({ sku: true, barcode: true, categories: true });
    const words = text('Sale Cap');
    const sku = words.indexOf('SKU CAP-1');
    const barcode = words.indexOf('9990001');
    const categories = words.indexOf('A, B');
    expect(sku).toBeGreaterThan(words.search(/16\.00/));
    expect(barcode).toBeGreaterThan(sku);
    expect(categories).toBeGreaterThan(barcode);
    expect(text('Plain Mug')).not.toContain('SKU');
  });

  it('T6: with stock off, an in-stock product shows no stock but an out-of-stock one still does, unless price is off too', () => {
    mount({ stock: false });
    expect(text('Sale Cap')).not.toContain('In Stock');
    expect(text('Gone Scarf')).toContain('Out of Stock');
    cleanup();
    mount({ stock: false, price: false });
    expect(text('Gone Scarf')).not.toContain('Out of Stock');
    expect(text('Sale Cap')).not.toContain('In Stock');
  });

  it('T7: one switch is merged over the defaults, keeping the name, price and stock', () => {
    mount({ sku: true });
    expect(text('Sale Cap')).toContain('Sale Cap');
    expect(text('Sale Cap')).toMatch(/\(was .*20\.00\)/);
    expect(text('Sale Cap')).toContain('In Stock');
    expect(text('Sale Cap')).toContain('SKU CAP-1');
  });
});
