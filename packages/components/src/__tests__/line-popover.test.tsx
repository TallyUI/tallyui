import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi, type Mock } from 'vitest';
import { formatMoney } from '@tallyui/core';
import { PortalHost } from '@tallyui/primitives';
import { LinePopover, type LinePopoverProps } from '../sale/line-popover';

afterEach(cleanup);

function open(props: Partial<LinePopoverProps> & Pick<LinePopoverProps, 'kind'>) {
  const onApply: Mock<LinePopoverProps['onApply']> = vi.fn(props.onApply ?? (() => null));
  render(<><LinePopover lineName="Shirt" currency="EUR" value={props.kind === 'price' ? 1250 : 1} {...props} onApply={onApply} /><PortalHost /></>);
  fireEvent.click(screen.getByRole('button', { name: `Edit ${props.kind} of Shirt` }));
  return onApply;
}
const keys = (...names: string[]) => names.forEach((name) =>
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name })));
const physical = (...names: string[]) => names.forEach((key) => act(() => { fireEvent.keyDown(document, { key }); }));

it('types a whole quantity on the keypad and Apply writes it, from a named dialog that takes focus', () => {
  const onApply = open({ kind: 'quantity' });
  const dialog = screen.getByRole('dialog', { name: 'Quantity for Shirt' });
  expect(dialog.contains(document.activeElement)).toBe(true);
  expect(within(dialog).queryByRole('button', { name: 'Decimal point' })).toBeNull();
  keys('1', '2');
  expect(screen.getByTestId('quantity-popover-value').textContent).toBe('12');
  keys('Apply');
  expect(onApply).toHaveBeenCalledExactlyOnceWith(12);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('types a price with its decimal key, or from the keyboard, and Apply writes minor units', () => {
  const onApply = open({ kind: 'price' });
  keys('1', '4', 'Decimal point', '5');
  expect(screen.getByTestId('price-popover-value').textContent).toBe('14.5');
  keys('Apply');
  fireEvent.click(screen.getByRole('button', { name: 'Edit price of Shirt' }));
  physical('9', 'Backspace', '8');
  keys('Apply');
  expect(onApply.mock.calls).toEqual([[1450], [800]]);
});

it.each(['Cancel', 'Escape'])('%s closes after typing and writes nothing', (how) => {
  const onApply = open({ kind: 'quantity' });
  keys('4');
  if (how === 'Cancel') keys('Cancel'); else physical('Escape');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(onApply).not.toHaveBeenCalled();
});

it("a quick-discount key sets the price that much off the line's price", () => {
  const onApply = open({ kind: 'price', quickDiscounts: [10] });
  keys('Discount (10%)');
  expect(screen.getByTestId('price-popover-value').textContent).toBe(formatMoney({ amount: 1125, currency: 'EUR' }));
  keys('Apply');
  expect(onApply).toHaveBeenCalledExactlyOnceWith(1125);
});

it('Apply with nothing typed writes nothing; a refusal shows and the popover stays open', () => {
  const unchanged = open({ kind: 'price' });
  keys('Apply');
  expect(unchanged).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull();
  cleanup();
  const refusing = open({ kind: 'quantity', onApply: vi.fn(() => 'No') });
  keys('3', 'Apply');
  expect(refusing).toHaveBeenCalledExactlyOnceWith(3);
  expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toBe('No');
});
