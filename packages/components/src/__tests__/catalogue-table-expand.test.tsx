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
const tee = { id: 80, name: 'Tee', type: 'variable', status: 'publish', variations: [81, 82, 83], attributes: [
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

function mount(expand?: boolean, pickAnyOptions?: boolean) {
  const onSelect = vi.fn();
  render(<Catalogue products={[tee]} traits={wooProductTraits} currency="EUR" onSelect={onSelect} lastSyncedAt={null}
    defaultViewState={{ view: 'table' }} tableRow={{ thumbnail: true, addButton: true, expand }} pickAnyOptions={pickAnyOptions} />, { wrapper });
  return onSelect;
}
const variants = (product: object) => wooProductTraits.getVariants!(product, { currency: 'EUR' });
const press = (testID: string) => fireEvent.click(screen.getByTestId(testID));

it("C1: expand unset keeps today's table and its list chooser", () => {
  const onSelect = mount();
  expect(screen.queryByTestId('product-row-expand-80')).toBeNull();
  press('product-row-add-80');
  expect(screen.getByLabelText('Choose variant')).toBeTruthy();
  expect(onSelect).not.toHaveBeenCalled();
});

it('C2: the thumbnail shows and hides variant rows with chips and prices', () => {
  const onSelect = mount(true);
  press('product-row-expand-80');
  expect(screen.getByTestId('product-row-expand-80').getAttribute('aria-expanded')).toBe('true');
  for (const id of ['81', '82', '83']) expect(screen.getByTestId(`variation-row-${id}`)).toBeTruthy();
  expect(within(screen.getByTestId('variation-row-81-chips')).getAllByText(/.+/).map((node) => node.textContent)).toEqual(['M', 'Red']);
  expect(within(screen.getByTestId('variation-row-81')).getByText(variantPriceLabel(variants(tee)[0], 'EUR')!)).toBeTruthy();
  expect(screen.queryByLabelText('Choose variant')).toBeNull();
  expect(onSelect).not.toHaveBeenCalled();
  press('product-row-expand-80');
  expect(screen.queryAllByTestId(/^variation-row-/)).toHaveLength(0);
  expect(screen.getByTestId('product-row-expand-80').getAttribute('aria-expanded')).toBe('false');
});

it('C3: a subrow + adds that variant and leaves the expansion open', () => {
  const onSelect = mount(true);
  press('product-row-expand-80');
  press('variation-row-add-82');
  expect(onSelect).toHaveBeenCalledExactlyOnceWith({ product: tee, variant: variants(tee)[1] });
  expect(screen.getByTestId('variation-row-81')).toBeTruthy();
});

it("C4: a subrow + takes the chooser's path for local Any options", () => {
  const onSelect = mount(true, true);
  press('product-row-expand-80');
  press('variation-row-add-83');
  expect(onSelect).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Choose options')).toBeTruthy();
});

it('V6: variationsButton without a thumbnail shows and expands the variant rows', () => {
  const onSelect = vi.fn();
  render(<Catalogue products={[tee]} traits={wooProductTraits} currency="EUR" onSelect={onSelect} lastSyncedAt={null}
    defaultViewState={{ view: 'table' }} tableRow={{ expand: true, variationsButton: true }} />, { wrapper });
  expect(screen.queryByTestId('product-row-expand-80')).toBeNull();
  press('product-row-variations-80');
  for (const id of ['81', '82', '83']) expect(screen.getByTestId(`variation-row-${id}`)).toBeTruthy();
  expect(onSelect).not.toHaveBeenCalled();
});

// A Woo shirt: Size {S, M} × Colour {Red, Blue}, one variant per pair.
const shirt = { id: 90, name: 'Shirt', type: 'variable', status: 'publish', variations: [91, 92, 93, 94], attributes: [
  { name: 'Size', variation: true, position: 0, options: ['S', 'M'] },
  { name: 'Colour', variation: true, position: 1, options: ['Red', 'Blue'] },
], variation_docs: [['S', 'Red'], ['S', 'Blue'], ['M', 'Red'], ['M', 'Blue']].map(([size, colour], index) => ({
  id: 91 + index, status: 'publish', sku: `SHIRT-${size}-${colour}`, regular_price: '30', stock_status: 'instock',
  attributes: [{ name: 'Size', option: size }, { name: 'Colour', option: colour }] })) };
// A cap whose one group has one value: an M and an "Any size".
const cap = { id: 95, name: 'Cap', type: 'variable', status: 'publish', variations: [96, 97], attributes: [
  { name: 'Size', variation: true, position: 0, options: ['M'] },
], variation_docs: [
  { id: 96, status: 'publish', sku: 'CAP-M', regular_price: '10', stock_status: 'instock', attributes: [{ name: 'Size', option: 'M' }] },
  { id: 97, status: 'publish', sku: 'CAP', regular_price: '10', stock_status: 'instock', attributes: [] },
] };

function mountProducts(products: object[]) {
  const onSelect = vi.fn();
  render(<Catalogue products={products} traits={wooProductTraits} currency="EUR" onSelect={onSelect} lastSyncedAt={null}
    defaultViewState={{ view: 'table' }} tableRow={{ thumbnail: true, addButton: true, expand: true }} />, { wrapper });
  return onSelect;
}
const rowIds = () => screen.queryAllByTestId(/^variation-row-\d+$/).map((node) => node.getAttribute('data-testid')!.slice('variation-row-'.length));
function choose(filter: string, option: string) {
  press(filter);
  fireEvent.click(screen.getByRole('option', { name: option }));
}

it('F1: one select per group narrows the rows, and All clears that filter', () => {
  mountProducts([shirt]);
  press('product-row-expand-90');
  expect(screen.getByTestId('variation-filter-90-Size')).toBeTruthy();
  expect(screen.getByTestId('variation-filter-90-Colour')).toBeTruthy();
  expect(screen.queryAllByTestId(/^variation-filter-90-/)).toHaveLength(2);
  expect(rowIds()).toEqual(['91', '92', '93', '94']);
  choose('variation-filter-90-Size', 'M');
  expect(rowIds()).toEqual(['93', '94']);
  choose('variation-filter-90-Colour', 'Blue');
  expect(rowIds()).toEqual(['94']);
  choose('variation-filter-90-Size', 'All');
  expect(rowIds()).toEqual(['92', '94']);
});

it('F2: a group with one value draws no select, only the chevron', () => {
  mountProducts([cap]);
  press('product-row-expand-95');
  expect(rowIds()).toEqual(['96', '97']);
  expect(screen.queryAllByTestId(/^variation-filter-95-/)).toHaveLength(0);
  expect(within(screen.getByTestId('variation-filters-95')).getByLabelText('Collapse')).toBeTruthy();
});

it('F3: Collapse folds the row, and expanding again shows every variant', () => {
  mountProducts([shirt]);
  press('product-row-expand-90');
  choose('variation-filter-90-Size', 'M');
  expect(rowIds()).toEqual(['93', '94']);
  fireEvent.click(within(screen.getByTestId('variation-filters-90')).getByLabelText('Collapse'));
  expect(rowIds()).toEqual([]);
  expect(screen.getByTestId('product-row-expand-90').getAttribute('aria-expanded')).toBe('false');
  press('product-row-expand-90');
  expect(rowIds()).toEqual(['91', '92', '93', '94']);
});

it('F4: filters that match nothing say so, and hidden variants have no +', () => {
  mountProducts([tee]);
  press('product-row-expand-80');
  choose('variation-filter-80-Size', 'S');
  choose('variation-filter-80-Colour', 'Red');
  expect(rowIds()).toEqual([]);
  expect(screen.getByText('No variants match.')).toBeTruthy();
  for (const id of ['81', '82', '83']) expect(screen.queryByTestId(`variation-row-add-${id}`)).toBeNull();
});

it("F5: a filtered row's + adds that variant", () => {
  const onSelect = mountProducts([shirt]);
  press('product-row-expand-90');
  choose('variation-filter-90-Colour', 'Blue');
  press('variation-row-add-94');
  expect(onSelect).toHaveBeenCalledExactlyOnceWith({ product: shirt, variant: variants(shirt)[3] });
});
