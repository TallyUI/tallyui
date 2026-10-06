import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChargeForm } from '../sale/charge-form';

afterEach(() => cleanup());
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const input = (name: string, value: string) => fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } });
const taxClasses = [{ id: 'reduced', label: 'Reduced' }];

describe('ChargeForm', () => {
  it.each([['Fee', 'fee'], ['Shipping', 'shipping'], ['Custom item', 'custom']])('applies %s and closes', (label, kind) => {
    const onApply = vi.fn().mockReturnValue(null);
    const onClose = vi.fn();
    render(<ChargeForm currency="EUR" onApply={onApply} onClose={onClose} />);
    click(label);
    expect(screen.getByRole('button', { name: label }).getAttribute('aria-selected')).toBe('true');
    input('Name', ' Wrapping ');
    input('Amount', '1,50');
    click('Apply');
    expect(onApply).toHaveBeenCalledExactlyOnceWith({ kind, name: 'Wrapping', amountMinor: 150,
      taxStatus: undefined, taxClass: undefined });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    [' ', '1', 'Enter a name.'], ['Bag', '', 'Enter a price.'], ['Bag', 'abc', 'Enter a number.'],
    ['Bag', '-1', 'Enter a price of 0 or more.'], ['Bag', '1.234', 'Use at most 2 decimal places.'],
  ])('rejects name %s and amount %s', (name, amount, message) => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(<ChargeForm currency="EUR" onApply={onApply} onClose={onClose} />);
    input('Name', name);
    input('Amount', amount);
    click('Apply');
    expect(screen.getByRole('alert').textContent).toBe(message);
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each([undefined, { none: false, classes: true }, { none: true, classes: false }])('gates No tax on lineTax.none (%s)', (lineTax) => {
    render(<ChargeForm currency="EUR" lineTax={lineTax} onApply={() => null} onClose={() => {}} />);
    expect(Boolean(screen.queryByRole('switch', { name: 'No tax' }))).toBe(lineTax?.none === true);
  });

  it.each([
    [undefined, taxClasses, false], [{ none: true, classes: false }, taxClasses, false],
    [{ none: true, classes: true }, undefined, false], [{ none: true, classes: true }, [], false],
    [{ none: true, classes: true }, taxClasses, true],
  ] as const)('gates the class picker on the capability and entries (%s, %s)', (lineTax, classes, shown) => {
    render(<ChargeForm currency="EUR" lineTax={lineTax} taxClasses={classes} onApply={() => null} onClose={() => {}} />);
    expect(Boolean(screen.queryByRole('group', { name: 'Tax class' }))).toBe(shown);
    if (shown) expect(screen.getByRole('button', { name: 'No class' }).getAttribute('aria-selected')).toBe('true');
  });

  it('applies the selected tax status and class, and returns to the standard defaults', () => {
    const onApply = vi.fn().mockReturnValue(null);
    render(<ChargeForm currency="EUR" lineTax={{ none: true, classes: true }} taxClasses={taxClasses}
      onApply={onApply} onClose={() => {}} />);
    input('Name', 'Bag');
    input('Amount', '0');
    fireEvent.click(screen.getByRole('switch', { name: 'No tax' }));
    click('Reduced');
    expect(screen.getByRole('switch', { name: 'No tax' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('button', { name: 'Reduced' }).getAttribute('aria-selected')).toBe('true');
    click('Apply');
    expect(onApply).toHaveBeenLastCalledWith({ kind: 'fee', name: 'Bag', amountMinor: 0, taxStatus: 'none', taxClass: 'reduced' });
    fireEvent.click(screen.getByRole('switch', { name: 'No tax' }));
    click('No class');
    expect(screen.getByRole('switch', { name: 'No tax' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('button', { name: 'Reduced' }).getAttribute('aria-selected')).toBe('false');
    click('Apply');
    expect(onApply).toHaveBeenLastCalledWith({ kind: 'fee', name: 'Bag', amountMinor: 0, taxStatus: undefined, taxClass: undefined });
  });

  it('hides and omits tax overrides for shipping taxed by the store', () => {
    const onApply = vi.fn().mockReturnValue(null);
    render(<ChargeForm currency="EUR" lineTax={{ none: true, classes: true }} taxClasses={taxClasses}
      shippingTaxFromStore onApply={onApply} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('switch', { name: 'No tax' }));
    click('Reduced');
    click('Shipping');
    expect(screen.queryByRole('switch', { name: 'No tax' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Tax class' })).toBeNull();
    expect(screen.getByText("Shipping is taxed at the store's shipping tax class.")).toBeTruthy();
    input('Name', 'Delivery');
    input('Amount', '2');
    click('Apply');
    expect(onApply).toHaveBeenCalledExactlyOnceWith({ kind: 'shipping', name: 'Delivery', amountMinor: 200,
      taxStatus: undefined, taxClass: undefined });
    click('Custom item');
    expect(screen.getByRole('switch', { name: 'No tax' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Tax class' })).toBeTruthy();
    expect(screen.queryByText("Shipping is taxed at the store's shipping tax class.")).toBeNull();
  });

  it('shows a refusal inline and closes only on Cancel', () => {
    const onApply = vi.fn().mockReturnValue('This sale is being saved. Retry to finish it.');
    const onClose = vi.fn();
    render(<ChargeForm currency="EUR" onApply={onApply} onClose={onClose} />);
    input('Name', 'Bag');
    input('Amount', '1');
    click('Apply');
    expect(screen.getByRole('alert').textContent).toBe('This sale is being saved. Retry to finish it.');
    expect(onClose).not.toHaveBeenCalled();
    click('Cancel');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledTimes(1);
  });
});
