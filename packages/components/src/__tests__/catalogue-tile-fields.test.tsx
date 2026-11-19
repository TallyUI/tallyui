import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorProvider, type TallyConnector } from '@tallyui/core';
import { medusaConnector } from '@tallyui/connector-medusa';
import { woocommerceConnector, wooProductTraits } from '@tallyui/connector-woocommerce';
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

// 9.9c. The drill set up as catalogue-variations-drill.test.tsx (its Woo tee, copied): the drill's variant tiles and
// the loading skeleton follow tileFields too.
const tee = { id: 80, name: 'Tee', type: 'variable', status: 'publish', attributes: [
  { name: 'Size', variation: true, position: 0, options: ['S', 'M', 'L'] },
  { name: 'Colour', variation: true, position: 1, options: ['Red', 'Blue'] },
], variation_docs: [
  { id: 81, status: 'publish', sku: 'TEE-M-RED', regular_price: '20', stock_status: 'instock',
    attributes: [{ name: 'Size', option: 'M' }, { name: 'Colour', option: 'Red' }] },
  { id: 82, status: 'publish', sku: 'TEE-S-BLUE', regular_price: '20', stock_status: 'instock',
    attributes: [{ name: 'Size', option: 'S' }, { name: 'Colour', option: 'Blue' }] },
] };
const band = () => screen.getAllByTestId('catalogue-loading-band')[0].style.height;
function mountLoading(tileFields?: Partial<TileFields>) {
  render(<Catalogue products={[]} traits={traits} currency="EUR" onSelect={vi.fn()} lastSyncedAt={null} tileFields={tileFields} />);
}

describe('Catalogue tileFields in the drill and the skeleton', () => {
  it('C1: a drill variant tile shows its SKU and no option chips with name off and sku on', () => {
    render(
      <ConnectorProvider connector={woocommerceConnector}>
        <Catalogue products={[tee]} traits={wooProductTraits} currency="EUR" onSelect={vi.fn()} lastSyncedAt={null}
          variationsStyle="drill" tileFields={{ name: false, sku: true }} />
      </ConnectorProvider>,
    );
    fireEvent.click(screen.getByTestId('product-tile-Tee'));
    expect(screen.getByTestId('variation-tile-81').textContent).toContain('SKU TEE-M-RED');
    expect(screen.getByTestId('variation-tile-82').textContent).toContain('SKU TEE-S-BLUE');
    expect(screen.queryByTestId('variation-tile-81-chips')).toBeNull();
  });

  it('S1: without tileFields the loading band is 83 px', () => {
    mountLoading();
    expect(band()).toBe('83px');
  });

  it('S2: the loading band grows by a gap and a line per fact row, and is 0 with every field off', () => {
    mountLoading({ sku: true, barcode: true });
    expect(band()).toBe('131px');
    cleanup();
    mountLoading({ name: false, price: false, onSale: false, sku: false, barcode: false, categories: false, stock: false });
    expect(band()).toBe('0px');
  });
});
