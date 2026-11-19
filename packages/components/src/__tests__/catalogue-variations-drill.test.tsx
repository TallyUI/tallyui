import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ConnectorProvider } from '@tallyui/core';
import { woocommerceConnector, wooProductTraits } from '@tallyui/connector-woocommerce';
import { PortalHost } from '@tallyui/primitives';
import { variantPriceLabel } from '@tallyui/pos';
import { Catalogue } from '../sale/catalogue';

afterEach(cleanup);
const wrapper = ({ children }: { children: ReactNode }) =>
  <ConnectorProvider connector={woocommerceConnector}>{children}<PortalHost /></ConnectorProvider>;

// A Woo variable tee: Size × Colour, with M-Red, S-Blue and an L in "Any colour" (a local group, so #495 asks for it).
const tee = { id: 80, name: 'Tee', type: 'variable', status: 'publish', attributes: [
  { name: 'Size', variation: true, position: 0, options: ['S', 'M', 'L'] },
  { name: 'Colour', variation: true, position: 1, options: ['Red', 'Blue'] },
], variation_docs: [
  { id: 81, status: 'publish', sku: 'TEE-M-RED', regular_price: '20', stock_status: 'instock',
    attributes: [{ name: 'Size', option: 'M' }, { name: 'Colour', option: 'Red' }] },
  { id: 82, status: 'publish', sku: 'TEE-S-BLUE', regular_price: '20', stock_status: 'instock',
    attributes: [{ name: 'Size', option: 'S' }, { name: 'Colour', option: 'Blue' }] },
  { id: 83, status: 'publish', sku: 'TEE-L', regular_price: '22', stock_status: 'instock',
    attributes: [{ name: 'Size', option: 'L' }] },
] };

type Style = 'list' | 'popover' | 'drill';
type CartLine = { productId: string; variantId?: string; quantity: number; custom?: true };
function mount(props: { variationsStyle?: Style; pickAnyOptions?: boolean; products?: object[]; cartLines?: CartLine[] } = {}) {
  const onSelect = vi.fn();
  const products = props.products ?? [tee];
  const view = render(<Catalogue products={products} traits={wooProductTraits} currency="EUR" onSelect={onSelect}
    lastSyncedAt={null} variationsStyle={props.variationsStyle} pickAnyOptions={props.pickAnyOptions} cartLines={props.cartLines} />, { wrapper });
  return { onSelect, view };
}
const variants = (product: object) => wooProductTraits.getVariants!(product, { currency: 'EUR' });
const press = (testID: string) => fireEvent.click(screen.getByTestId(testID));
const chips = (id: string) => within(screen.getByTestId(`variation-tile-${id}-chips`)).getAllByText(/.+/).map((node) => node.textContent);

it('D1: a variable tile swaps the grid for the parent tile and its variant tiles', () => {
  const { onSelect } = mount({ variationsStyle: 'drill' });
  press('product-tile-Tee');
  expect(screen.getByTestId('variations-parent-tile')).toBeTruthy();
  for (const id of ['81', '82', '83']) expect(screen.getByTestId(`variation-tile-${id}`)).toBeTruthy();
  expect(screen.queryByTestId('product-tile-Tee')).toBeNull();
  expect(screen.queryByLabelText('Choose variant')).toBeNull();
  expect(onSelect).not.toHaveBeenCalled();
});

it('D2: a variant tile shows its option chips in group order and its price', () => {
  mount({ variationsStyle: 'drill' });
  press('product-tile-Tee');
  expect(chips('81')).toEqual(['M', 'Red']);
  const tile = within(screen.getByTestId('variation-tile-81'));
  expect(tile.getByText(variantPriceLabel(variants(tee)[0], 'EUR')!)).toBeTruthy();
  expect(tile.getByText('Tee')).toBeTruthy();
});

it('D3: chips follow the product groups, not the variant attribute order', () => {
  const swapped = { ...tee, variation_docs: [
    { ...tee.variation_docs[0], attributes: [{ name: 'Colour', option: 'Red' }, { name: 'Size', option: 'M' }] },
    ...tee.variation_docs.slice(1)] };
  expect(Object.values(variants(swapped)[0].options!)).toEqual(['Red', 'M']);
  mount({ variationsStyle: 'drill', products: [swapped] });
  press('product-tile-Tee');
  expect(chips('81')).toEqual(['M', 'Red']);
});

it('D4: a variant tile adds that variant once and the drill stays open', () => {
  const { onSelect } = mount({ variationsStyle: 'drill' });
  press('product-tile-Tee');
  press('variation-tile-82');
  expect(onSelect).toHaveBeenCalledExactlyOnceWith({ product: tee, variant: variants(tee)[1] });
  expect(screen.getByTestId('variation-tile-81')).toBeTruthy();
  expect(screen.getByTestId('variations-parent-tile')).toBeTruthy();
});

it('D5: the parent tile goes back to the products', () => {
  mount({ variationsStyle: 'drill' });
  press('product-tile-Tee');
  expect(screen.getByTestId('variations-parent-tile').getAttribute('aria-label')).toBe('Back');
  press('variations-parent-tile');
  expect(screen.getByTestId('product-tile-Tee')).toBeTruthy();
  expect(screen.queryByTestId(/^variation-tile-/)).toBeNull();
  expect(screen.queryByTestId('variations-parent-tile')).toBeNull();
});

it('D6: typing a search leaves the drill', () => {
  mount({ variationsStyle: 'drill' });
  press('product-tile-Tee');
  fireEvent.change(screen.getByPlaceholderText('Search or scan barcode / SKU'), { target: { value: 'Te' } });
  expect(screen.queryByTestId('variations-parent-tile')).toBeNull();
  expect(screen.getByTestId('product-tile-Tee')).toBeTruthy();
});

it('D7: the product leaving the catalogue leaves the drill', () => {
  const { onSelect, view } = mount({ variationsStyle: 'drill' });
  press('product-tile-Tee');
  view.rerender(<Catalogue products={[]} traits={wooProductTraits} currency="EUR" onSelect={onSelect}
    lastSyncedAt={null} variationsStyle="drill" />);
  expect(screen.queryByTestId('variations-parent-tile')).toBeNull();
  expect(screen.queryByTestId(/^variation-tile-/)).toBeNull();
  view.rerender(<Catalogue products={[tee]} traits={wooProductTraits} currency="EUR" onSelect={onSelect}
    lastSyncedAt={null} variationsStyle="drill" />);
  expect(screen.getByTestId('product-tile-Tee')).toBeTruthy();
  expect(onSelect).not.toHaveBeenCalled();
});

it('D8: with pickAnyOptions, the Any variant opens the "Choose options" picker first', () => {
  const { onSelect } = mount({ variationsStyle: 'drill', pickAnyOptions: true });
  press('product-tile-Tee');
  press('variation-tile-83');
  expect(screen.getByLabelText('Choose options')).toBeTruthy();
  expect(onSelect).not.toHaveBeenCalled();
});

it('D9: a single-variant product adds at once', () => {
  const solo = { ...tee, id: 100, name: 'Solo', variation_docs: [{ ...tee.variation_docs[0], id: 101 }] };
  const { onSelect } = mount({ variationsStyle: 'drill', products: [solo] });
  press('product-tile-Solo');
  expect(onSelect).toHaveBeenCalledExactlyOnceWith({ product: solo, variant: variants(solo)[0] });
  expect(screen.queryByTestId('variations-parent-tile')).toBeNull();
});

it("D10: the default 'list' style still opens the variant list", () => {
  const { onSelect } = mount();
  press('product-tile-Tee');
  expect(screen.getByLabelText('Choose variant')).toBeTruthy();
  expect(screen.queryByTestId('variations-parent-tile')).toBeNull();
  expect(onSelect).not.toHaveBeenCalled();
});

it('C1: the drill shows a "Products › name" crumb with its back crumb focused', () => {
  mount({ variationsStyle: 'drill' });
  press('product-tile-Tee');
  const crumb = within(screen.getByTestId('products-breadcrumb'));
  expect(crumb.getByText('Products')).toBeTruthy();
  expect(crumb.getByText('Tee')).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByTestId('products-breadcrumb-back'));
});

it('C2: the Products crumb goes back to the products', () => {
  mount({ variationsStyle: 'drill' });
  press('product-tile-Tee');
  press('products-breadcrumb-back');
  expect(screen.queryByTestId('variations-parent-tile')).toBeNull();
  expect(screen.queryByTestId('products-breadcrumb')).toBeNull();
  expect(screen.getByTestId('product-tile-Tee')).toBeTruthy();
});

it('C3: Escape inside the drill goes back to the products', () => {
  mount({ variationsStyle: 'drill' });
  press('product-tile-Tee');
  fireEvent.keyDown(screen.getByTestId('variation-tile-81'), { key: 'Escape' });
  expect(screen.queryByTestId('variations-parent-tile')).toBeNull();
  expect(screen.getByTestId('product-tile-Tee')).toBeTruthy();
});

it('C4: in a category level, the drill hides the category crumb and Escape leaves only the drill', () => {
  // The smallest fixture change for C4: the tee in a category, so a level can hold a variable product.
  const filedTee = { ...tee, categories: [{ id: 7, name: 'Clothing' }] };
  render(<Catalogue products={[filedTee]} traits={wooProductTraits} currency="EUR" onSelect={vi.fn()} lastSyncedAt={null}
    variationsStyle="drill" showCategoryNav categoryBrowse="tiles" />, { wrapper });
  press('category-tile-7');
  press('product-tile-Tee');
  expect(screen.getByTestId('products-breadcrumb')).toBeTruthy();
  expect(screen.queryByTestId('category-crumb')).toBeNull();
  fireEvent.keyDown(screen.getByTestId('variation-tile-81'), { key: 'Escape' });
  expect(screen.queryByTestId('variations-parent-tile')).toBeNull();
  expect(screen.getByTestId('category-level-parent')).toBeTruthy();
  expect(screen.getByTestId('category-crumb')).toBeTruthy();
  fireEvent.keyDown(screen.getByTestId('product-tile-Tee'), { key: 'Escape' });
  expect(screen.getByTestId('category-browse')).toBeTruthy();
  expect(screen.queryByTestId('category-crumb')).toBeNull();
});

it("C5: the default 'list' style draws no Products crumb", () => {
  mount();
  press('product-tile-Tee');
  expect(screen.queryByTestId('products-breadcrumb')).toBeNull();
});

// 4.1c: the drill's stacked tile (v2 product-tile.tsx:54,76) and each variant's in-cart count (v2 variation-tile.tsx:176-177).
const solo = { ...tee, id: 100, name: 'Solo', variation_docs: [{ ...tee.variation_docs[0], id: 101 }] };
const stackIds = (name: string) => [`product-tile-${name}-stack`, `product-tile-${name}-stack-far`, `product-tile-${name}-stack-near`];
const teeLines: CartLine[] = [{ productId: '80', variantId: '81', quantity: 2 }, { productId: '80', variantId: '82', quantity: 1 },
  { productId: '80', quantity: 5, custom: true }];

it('S1: in drill style a variable tile is stacked and a single-variant tile is not', () => {
  mount({ variationsStyle: 'drill', products: [tee, solo] });
  for (const id of stackIds('Tee')) expect(screen.getByTestId(id)).toBeTruthy();
  for (const id of stackIds('Solo')) expect(screen.queryByTestId(id)).toBeNull();
}, 20_000);

it.each(['list', 'popover'] as const)("S2: in '%s' style the variable tile has no stack", (style) => {
  mount({ variationsStyle: style });
  expect(screen.getByTestId('product-tile-Tee')).toBeTruthy();
  expect(screen.queryByTestId('product-tile-Tee-stack')).toBeNull();
}, 20_000);

it("S3: each variant tile counts that variant's non-custom lines; the parent tile shows no count", () => {
  mount({ variationsStyle: 'drill', cartLines: teeLines });
  press('product-tile-Tee');
  expect(screen.getByTestId('variation-tile-81-in-cart').textContent).toBe('2');
  expect(screen.getByTestId('variation-tile-82-in-cart').textContent).toBe('1');
  expect(screen.queryByTestId('variation-tile-83-in-cart')).toBeNull();
  const parent = within(screen.getByTestId('variations-parent-tile'));
  expect(parent.queryByLabelText(/in cart/)).toBeNull();
  expect(parent.queryByText(/^\d+$/)).toBeNull();
}, 20_000);

it('S3b: a custom line counts for no variant, even with a variantId', () => {
  mount({ variationsStyle: 'drill', cartLines: [{ productId: '80', variantId: '83', quantity: 5, custom: true }] });
  press('product-tile-Tee');
  expect(screen.queryByTestId('variation-tile-83-in-cart')).toBeNull();
}, 20_000);

it('S4: a line without variantId counts on the product tile and on no variant tile', () => {
  mount({ variationsStyle: 'drill', cartLines: [{ productId: '80', quantity: 4 }] });
  expect(screen.getByTestId('in-cart-80').textContent).toBe('4');
  press('product-tile-Tee');
  expect(screen.queryAllByTestId(/^variation-tile-.*-in-cart$/)).toHaveLength(0);
}, 20_000);

it("S5: back in the grid, the product tile still shows the product's total", () => {
  mount({ variationsStyle: 'drill', cartLines: teeLines });
  press('product-tile-Tee');
  press('variations-parent-tile');
  expect(screen.getByTestId('in-cart-80').textContent).toBe('3');
}, 20_000);
