import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { StockLevel, VariantOptionGroup, VariantSummary } from '@tallyui/core';
import { PortalHost } from '@tallyui/primitives';
import { variantPriceLabel } from '@tallyui/pos';
import { VariationPicker, type VariationPickerProps } from '../product/variation-picker';

afterEach(cleanup);

const variant = (id: string, options: Record<string, string>, amount: number, stock: StockLevel = { status: 'in_stock', quantity: 4 }): VariantSummary =>
  ({ id, options, prices: [{ kind: 'base', amount, currency: 'EUR' }], stock });
const groups: VariantOptionGroup[] = [
  { name: 'Size', values: ['S', 'M', 'L'] },
  { name: 'Colour', values: ['Red', 'Blue'] },
];
const sRed = variant('s-red', { Size: 'S', Colour: 'Red' }, 1000);
const sBlue = variant('s-blue', { Size: 'S', Colour: 'Blue' }, 1000);
const mRed = variant('m-red', { Size: 'M', Colour: 'Red' }, 1200, { status: 'out_of_stock', quantity: 0 });
const lAny = variant('l-any', { Size: 'L' }, 1500);
const tee = [sRed, sBlue, mRed, lAny];

function mount(props: Partial<VariationPickerProps> = {}) {
  const onAdd = vi.fn(props.onAdd ?? (() => undefined));
  render(<><VariationPicker title="Tee" groups={groups} variants={tee} currency="EUR" {...props} onAdd={onAdd} /><PortalHost /></>);
  return onAdd;
}
const press = (value: string) => fireEvent.click(screen.getByTestId(`variation-option-${value}`));
const addButton = () => screen.getByTestId('variation-popover-add-to-cart');

it('shows Add with the price once the picks match, and adds only when it is pressed', () => {
  const onAdd = mount();
  expect(screen.getByTestId('variation-popover')).toBeTruthy();
  press('M');
  expect(screen.queryByTestId('variation-popover-add-to-cart')).toBeNull();
  press('Red');
  expect(addButton().textContent).toBe(`Add to Cart: ${variantPriceLabel(mRed, 'EUR')}`);
  expect(screen.getByTestId('variation-popover-stock-badge').textContent).toBe('Out of Stock');
  expect(onAdd).not.toHaveBeenCalled();
  fireEvent.click(addButton());
  expect(onAdd).toHaveBeenCalledExactlyOnceWith(mRed, {});
});

it('a disabled option cannot be picked, and a picked chip pressed again is un-picked', () => {
  mount();
  press('M');
  expect(screen.getByTestId('variation-option-Blue').getAttribute('aria-disabled')).toBe('true');
  expect(screen.getByTestId('variation-option-S').getAttribute('aria-disabled')).not.toBe('true');
  press('Blue');
  expect(screen.getByTestId('variation-option-Blue').getAttribute('aria-selected')).not.toBe('true');
  press('M');
  expect(screen.getByTestId('variation-option-Blue').getAttribute('aria-disabled')).not.toBe('true');
});

it('says "Variant not available" for complete picks no variant matches', () => {
  // Disabled values keep every pick reachable, so a no-match comes from the variants changing under the picks
  // (a resync drops S-Red while it is picked).
  const onAdd = vi.fn();
  const { rerender } = render(<VariationPicker title="Tee" groups={groups} variants={tee} currency="EUR" onAdd={onAdd} />);
  press('S');
  press('Red');
  expect(screen.queryByTestId('variation-popover-unavailable')).toBeNull();
  rerender(<VariationPicker title="Tee" groups={groups} variants={[sBlue, mRed, lAny]} currency="EUR" onAdd={onAdd} />);
  expect(screen.getByTestId('variation-popover-unavailable').textContent).toBe('Variant not available');
  expect(screen.queryByTestId('variation-popover-add-to-cart')).toBeNull();
  expect(onAdd).not.toHaveBeenCalled();
});

it('a group whose values are long renders a Select with its placeholder, not chips', () => {
  const material = { name: 'Material', values: ['Organic cotton', 'Recycled polyester'] };
  const cotton = variant('cotton', { Material: 'Organic cotton' }, 2000);
  const onAdd = mount({ groups: [material], variants: [cotton, variant('poly', { Material: 'Recycled polyester' }, 1800)] });
  expect(screen.queryByTestId('variation-option-Organic cotton')).toBeNull();
  const trigger = screen.getByTestId('variation-select-Material');
  expect(trigger.textContent).toBe('Select an option');
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('option', { name: 'Organic cotton' }));
  fireEvent.click(addButton());
  expect(onAdd).toHaveBeenCalledExactlyOnceWith(cotton, {});
});

it('switches to a Select when the values join to exactly 15 characters, and keeps chips at 14', () => {
  const fifteen = { name: 'Fit', values: ['Extra', 'Large', 'Small'] };
  mount({ groups: [fifteen], variants: fifteen.values.map((value) => variant(value, { Fit: value }, 1000)) });
  expect(screen.getByTestId('variation-select-Fit')).toBeTruthy();
  expect(screen.queryByTestId('variation-option-Extra')).toBeNull();
  cleanup();
  const fourteen = { name: 'Fit', values: ['Extra', 'Large', 'Tiny'] };
  mount({ groups: [fourteen], variants: fourteen.values.map((value) => variant(value, { Fit: value }, 1000)) });
  expect(screen.getByTestId('variation-option-Extra')).toBeTruthy();
  expect(screen.queryByTestId('variation-select-Fit')).toBeNull();
});

it('preventOverselling disables Add for an out-of-stock match', () => {
  const onAdd = mount({ preventOverselling: true });
  press('M');
  press('Red');
  expect(addButton().getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(addButton());
  expect(onAdd).not.toHaveBeenCalled();
});

it("passes the picked colour as the Any variant's anyPicks", () => {
  const onAdd = mount();
  press('L');
  press('Blue');
  expect(screen.getByTestId('variation-popover-stock-badge').textContent).toBe('In Stock (4)');
  fireEvent.click(addButton());
  expect(onAdd).toHaveBeenCalledExactlyOnceWith(lAny, { Colour: 'Blue' });
});

it('disables Add while the onAdd promise is pending', async () => {
  let settle: () => void = () => undefined;
  const onAdd = mount({ onAdd: () => new Promise<void>((resolve) => { settle = resolve; }) });
  press('S');
  press('Red');
  fireEvent.click(addButton());
  expect(addButton().getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(addButton());
  expect(onAdd).toHaveBeenCalledTimes(1);
  await act(async () => { settle(); });
  expect(addButton().getAttribute('aria-disabled')).not.toBe('true');
});
