import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ConnectorProvider } from '@tallyui/core';
import { woocommerceConnector, wooProductTraits } from '@tallyui/connector-woocommerce';
import { PortalHost } from '@tallyui/primitives';
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
// The same product with no variation attributes: no option groups, so the popover falls back to the list.
const plain = { ...tee, id: 90, name: 'Plain', attributes: [],
  variation_docs: tee.variation_docs.map((doc) => ({ ...doc, id: doc.id + 10, attributes: [] })) };

function mount(props: { variationsStyle?: 'list' | 'popover'; pickAnyOptions?: boolean; products?: object[] } = {}) {
  const onSelect = vi.fn();
  const products = props.products ?? [tee];
  const view = render(<Catalogue products={products} traits={wooProductTraits} currency="EUR" onSelect={onSelect}
    lastSyncedAt={null} variationsStyle={props.variationsStyle} pickAnyOptions={props.pickAnyOptions} />, { wrapper });
  return { onSelect, view };
}
const variants = (product: object) => wooProductTraits.getVariants!(product, { currency: 'EUR' });
const press = (testID: string) => fireEvent.click(screen.getByTestId(testID));

it("opens the popover from a tile, adds the picked variant only on Add, and closes", () => {
  const { onSelect } = mount({ variationsStyle: 'popover' });
  press('product-tile-Tee');
  expect(screen.getByTestId('variation-popover')).toBeTruthy();
  expect(screen.queryByLabelText('Choose variant')).toBeNull();
  press('variation-option-M');
  press('variation-option-Red');
  expect(onSelect).not.toHaveBeenCalled();
  press('variation-popover-add-to-cart');
  expect(onSelect).toHaveBeenCalledExactlyOnceWith({ product: tee, variant: variants(tee)[0] });
  expect(screen.queryByTestId('variation-popover')).toBeNull();
  expect(screen.queryByLabelText('Choose options')).toBeNull();
});

it('keeps the list chooser with the default style', () => {
  const { onSelect } = mount();
  press('product-tile-Tee');
  expect(screen.getByLabelText('Choose variant')).toBeTruthy();
  expect(screen.queryByTestId('variation-popover')).toBeNull();
  expect(onSelect).not.toHaveBeenCalled();
});

it('falls back to the list chooser for a product with no option groups', () => {
  mount({ variationsStyle: 'popover', products: [plain] });
  press('product-tile-Plain');
  expect(screen.getByLabelText('Choose variant')).toBeTruthy();
  expect(screen.queryByTestId('variation-popover')).toBeNull();
});

it('with pickAnyOptions, Add on the Any variant passes its picks with no "Choose options" step', () => {
  const { onSelect } = mount({ variationsStyle: 'popover', pickAnyOptions: true });
  press('product-tile-Tee');
  press('variation-option-L');
  press('variation-option-Blue');
  press('variation-popover-add-to-cart');
  expect(onSelect).toHaveBeenCalledExactlyOnceWith({ product: tee, variant: variants(tee)[2], picks: { Colour: 'Blue' } });
  expect(screen.queryByLabelText('Choose options')).toBeNull();
  expect(screen.queryByTestId('variation-popover')).toBeNull();
});

it('a press outside closes the popover without adding', () => {
  const { onSelect } = mount({ variationsStyle: 'popover' });
  press('product-tile-Tee');
  press('variation-popover-overlay');
  expect(screen.queryByTestId('variation-popover')).toBeNull();
  expect(onSelect).not.toHaveBeenCalled();
});

it('closes the popover when its product leaves the catalogue', () => {
  const { onSelect, view } = mount({ variationsStyle: 'popover' });
  press('product-tile-Tee');
  expect(screen.getByTestId('variation-popover')).toBeTruthy();
  view.rerender(<Catalogue products={[]} traits={wooProductTraits} currency="EUR" onSelect={onSelect}
    lastSyncedAt={null} variationsStyle="popover" />);
  expect(screen.queryByTestId('variation-popover')).toBeNull();
  expect(onSelect).not.toHaveBeenCalled();
});
