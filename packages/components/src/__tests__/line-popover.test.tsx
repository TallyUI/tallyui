import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi, type Mock } from 'vitest';
import { formatMoney, MoneyFormatProvider } from '@tallyui/core';
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

it('a price above its regular price shows the regular one struck through; equal, or a quantity, shows none', () => {
  const regular = `Regular price ${formatMoney({ amount: 1250, currency: 'EUR' })}`;
  open({ kind: 'price', value: 1000, regularValue: 1250 });
  expect(within(screen.getByRole('dialog')).getByLabelText(regular)).toBeTruthy();
  cleanup();
  open({ kind: 'price', value: 1000, regularValue: 1000 });
  expect(screen.queryByLabelText(/^Regular price/)).toBeNull();
  cleanup();
  open({ kind: 'quantity', regularValue: 1250 });
  expect(screen.queryByLabelText(/^Regular price/)).toBeNull();
});

it('an action closes the popover, then calls its onPress, and writes nothing', () => {
  const onPress = vi.fn();
  const onApply = vi.fn(() => null);
  render(<><LinePopover kind="quantity" lineName="Coffee" currency="EUR" value={1} onApply={onApply}
    actions={[{ id: 'remove', label: 'Remove', destructive: true, onPress }]} /><PortalHost /></>);
  fireEvent.click(screen.getByRole('button', { name: 'Edit quantity of Coffee' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove Coffee' }));
  expect(onPress).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(onApply).not.toHaveBeenCalled();
});

it('commit="close": − and + write the quantity at once, with no Apply or Cancel drawn', () => {
  const onApply = vi.fn((_value: number): string | null => null);
  const ui = (value: number) => <><LinePopover kind="quantity" lineName="Shirt" currency="EUR" value={value} onApply={onApply}
    commit="close" /><PortalHost /></>;
  const { rerender } = render(ui(3));
  fireEvent.click(screen.getByRole('button', { name: 'Edit quantity of Shirt' }));
  fireEvent.click(screen.getByTestId('quantity-popover-step-up'));
  expect(onApply).toHaveBeenCalledExactlyOnceWith(4);
  rerender(ui(4));
  expect(screen.getByTestId('quantity-popover-value').textContent).toBe('4');
  fireEvent.click(screen.getByRole('button', { name: 'One fewer' }));
  expect(onApply.mock.calls).toEqual([[4], [3]]);
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.queryByTestId('quantity-popover-apply')).toBeNull();
  expect(screen.queryByTestId('quantity-popover-cancel')).toBeNull();
});

it('commit="close": − at quantity 1 reads Remove, calls onRemove and writes nothing', () => {
  const onRemove = vi.fn();
  const onApply = open({ kind: 'quantity', value: 1, commit: 'close', onRemove });
  expect(screen.queryByTestId('quantity-popover-step-down')).toBeNull();
  const remove = screen.getByTestId('quantity-popover-remove');
  expect(remove.getAttribute('aria-label')).toBe('Remove');
  fireEvent.click(remove);
  expect(onRemove).toHaveBeenCalledOnce();
  expect(onApply).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull();
  cleanup();
  const alone = open({ kind: 'quantity', value: 1, commit: 'close' });
  expect(screen.queryByTestId('quantity-popover-remove')).toBeNull();
  const down = screen.getByTestId('quantity-popover-step-down');
  expect(down.getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(down);
  expect(alone).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeTruthy();
});

it('commit="close": Done writes the typed quantity; Escape closes and writes nothing; a press outside writes it', () => {
  const onApply = open({ kind: 'quantity', commit: 'close' });
  const reopen = () => fireEvent.click(screen.getByRole('button', { name: 'Edit quantity of Shirt' }));
  keys('5');
  fireEvent.click(screen.getByTestId('quantity-popover-done'));
  expect(onApply.mock.calls).toEqual([[5]]);
  expect(screen.queryByRole('dialog')).toBeNull();
  reopen();
  keys('7');
  physical('Escape');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(onApply.mock.calls).toEqual([[5]]);
  reopen();
  keys('8');
  fireEvent.click(screen.getByTestId('quantity-popover-overlay'));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(onApply.mock.calls).toEqual([[5], [8]]);
});

it('commit="close": a refused step shows the refusal and the stored quantity again', () => {
  const onApply = open({ kind: 'quantity', value: 2, commit: 'close', onApply: () => 'No more stock' });
  keys('6');
  fireEvent.click(screen.getByRole('button', { name: 'One more' }));
  expect(onApply).toHaveBeenCalledExactlyOnceWith(7);
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('alert').textContent).toBe('No more stock');
  expect(screen.getByTestId('quantity-popover-value').textContent).toBe('2');
});

it('without commit, Apply and Cancel are drawn and there is no stepper row or Done', () => {
  const onApply = open({ kind: 'quantity', onRemove: vi.fn() });
  expect(screen.getByTestId('quantity-popover-apply')).toBeTruthy();
  expect(screen.getByTestId('quantity-popover-cancel')).toBeTruthy();
  for (const id of ['step-down', 'step-up', 'remove', 'done']) expect(screen.queryByTestId(`quantity-popover-${id}`)).toBeNull();
  keys('4');
  fireEvent.click(screen.getByTestId('quantity-popover-overlay'));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(onApply).not.toHaveBeenCalled();
});

it('price commit="close": Done, with no Apply, Cancel or stepper row, writes the typed price once', () => {
  const onApply = open({ kind: 'price', commit: 'close' });
  for (const id of ['apply', 'cancel', 'step-down', 'step-up', 'remove']) {
    expect(screen.queryByTestId(`price-popover-${id}`)).toBeNull();
    expect(screen.queryByTestId(`quantity-popover-${id}`)).toBeNull();
  }
  expect(screen.queryByRole('button', { name: 'One more' })).toBeNull();
  keys('1', '4', 'Decimal point', '5');
  fireEvent.click(screen.getByTestId('price-popover-done'));
  expect(onApply).toHaveBeenCalledExactlyOnceWith(1450);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('price commit="close": a press outside writes the typed price; Escape after typing writes nothing', () => {
  const onApply = open({ kind: 'price', commit: 'close' });
  keys('9');
  fireEvent.click(screen.getByTestId('price-popover-overlay'));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(onApply).toHaveBeenCalledExactlyOnceWith(900);
  fireEvent.click(screen.getByRole('button', { name: 'Edit price of Shirt' }));
  keys('7');
  physical('Escape');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(onApply.mock.calls).toEqual([[900]]);
});

it('price commit="close": a quick-discount key then a press outside writes the discounted price', () => {
  const onApply = open({ kind: 'price', commit: 'close', quickDiscounts: [10] });
  keys('Discount (10%)');
  fireEvent.click(screen.getByTestId('price-popover-overlay'));
  expect(onApply).toHaveBeenCalledExactlyOnceWith(1125);
});

it('price commit="close": a refusal on a press outside goes to onCloseRefused; one on Done shows inline', () => {
  const onCloseRefused = vi.fn();
  open({ kind: 'price', commit: 'close', onApply: () => 'No', onCloseRefused });
  keys('3');
  fireEvent.click(screen.getByTestId('price-popover-overlay'));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(onCloseRefused).toHaveBeenCalledExactlyOnceWith('No');
  fireEvent.click(screen.getByRole('button', { name: 'Edit price of Shirt' }));
  keys('4');
  fireEvent.click(screen.getByTestId('price-popover-done'));
  expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toBe('No');
  expect(onCloseRefused).toHaveBeenCalledOnce();
});

it('price commit="close": the regular price above the value still shows struck through', () => {
  open({ kind: 'price', commit: 'close', value: 1000, regularValue: 1250 });
  expect(within(screen.getByRole('dialog')).getByLabelText(`Regular price ${formatMoney({ amount: 1250, currency: 'EUR' })}`)).toBeTruthy();
});

it('LP1: under a COMMA store, the keypad price stays canonical (1.500 KWD is 1500 minor)', () => {
  const onApply = vi.fn(() => null);
  render(<MoneyFormatProvider format={{ decimalSeparator: ',', thousandSeparator: '.' }}>
    <LinePopover kind="price" lineName="Shirt" currency="KWD" value={1250} onApply={onApply} /><PortalHost />
  </MoneyFormatProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Edit price of Shirt' }));
  keys('1', 'Decimal point', '5', '0', '0', 'Apply');
  expect(onApply).toHaveBeenCalledExactlyOnceWith(1500);
});
