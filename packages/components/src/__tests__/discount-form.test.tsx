import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { AppliedDiscount } from '@tallyui/pos';
import { DiscountChips, DiscountForm, discountLabel, parseDiscount } from '../sale/discount-form';

describe('parseDiscount', () => {
  it.each([
    ['0.125', 'KWD', { type: 'fixed', value: 125 }],
    ['0.125', 'EUR', 'Use at most 2 decimal places.'],
    ['5', 'JPY', { type: 'fixed', value: 5 }],
  ] as const)('parses fixed %s in %s', (text, currency, expected) => {
    expect(parseDiscount('fixed', text, currency)).toEqual(expected);
  });

  it.each([
    ['12.5', { type: 'percentage', value: 12.5 }],
    ['12.555', 'Use at most 2 decimal places.'],
  ] as const)('parses percentage %s with at most 2 decimals', (text, expected) => {
    expect(parseDiscount('percentage', text, 'KWD')).toEqual(expected);
  });
});

describe('discountLabel', () => {
  it('uses the supplied formatter for a fixed discount', () => {
    const discount: AppliedDiscount = { id: 'd1', type: 'fixed', value: 2000, amountMinor: 1250 };
    expect(discountLabel(discount, 'EUR', () => 'X')).toBe('X');
  });

  it('shows amountMinor (the #129 caps), not the requested amount', () => {
    // A fixed discount clamped by the discount engine: value (requested) is 2000, amountMinor (actual) is 1250.
    const discount: AppliedDiscount = { id: 'd1', type: 'fixed', value: 2000, amountMinor: 1250 };
    expect(discountLabel(discount, 'EUR')).toBe('€12.50');
  });

  it('shows a percentage discount by its value, which is never capped', () => {
    const discount: AppliedDiscount = { id: 'd1', type: 'percentage', value: 10, amountMinor: 250 };
    expect(discountLabel(discount, 'EUR')).toBe('10%');
  });
});

describe('DiscountForm', () => {
  it('applying a valid entry calls onApply and closes the form', () => {
    const onApply = vi.fn().mockReturnValue(null);
    const onClose = vi.fn();
    render(<DiscountForm title="Discount on Shirt" currency="EUR" onApply={onApply} onClose={onClose} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Discount value' }), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith({ type: 'percentage', value: 10 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a refusal string from onApply shows inline, and the form stays open", () => {
    const onApply = vi.fn().mockReturnValue('The discount is more than the line');
    const onClose = vi.fn();
    render(<DiscountForm title="Discount on Shirt" currency="EUR" onApply={onApply} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Amount' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Discount value' }), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('alert').textContent).toBe('The discount is more than the line');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('bad input shows the parse error and never calls onApply', () => {
    const onApply = vi.fn();
    render(<DiscountForm title="Order discount" currency="EUR" onApply={onApply} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Discount value' }), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('alert').textContent).toBe('A percentage can be at most 100.');
    expect(onApply).not.toHaveBeenCalled();
  });

  it('dialog layout: no heading, the field before Percent/Amount, starts at Amount', () => {
    render(<DiscountForm layout="dialog" title="Order discount" currency="EUR" onApply={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText('Order discount')).toBeNull();
    expect(screen.getByRole('group', { name: 'Order discount' })).toBeTruthy();
    const order = screen.getByTestId('discount-amount-input').compareDocumentPosition(screen.getByTestId('discount-percent-switch'));
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Amount' }).getAttribute('aria-selected')).toBe('true');
  });

  it('dialog layout: Add discount applies a fixed entry and closes', () => {
    const onApply = vi.fn().mockReturnValue(null);
    const onClose = vi.fn();
    render(<DiscountForm layout="dialog" currency="EUR" onApply={onApply} onClose={onClose} />);
    fireEvent.change(screen.getByTestId('discount-amount-input'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('add-discount-submit'));
    expect(onApply).toHaveBeenCalledWith({ type: 'fixed', value: 500 });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
  });

  it('dialog layout: a refusal shows inline and stays open; Cancel closes', () => {
    const onClose = vi.fn();
    render(<DiscountForm layout="dialog" currency="EUR" onApply={() => 'No discounts'} onClose={onClose} />);
    fireEvent.change(screen.getByTestId('discount-amount-input'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('add-discount-submit'));
    expect(screen.getByRole('alert').textContent).toBe('No discounts');
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('no title: the group is labelled Discount and no heading renders', () => {
    render(<DiscountForm currency="EUR" onApply={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Discount' })).toBeTruthy();
    expect(screen.queryByText('Discount')).toBeNull();
  });
});

describe('DiscountChips', () => {
  const discounts: AppliedDiscount[] = [{ id: 'd1', type: 'percentage', value: 10, amountMinor: 250 }];

  it('renders nothing with no discounts', () => {
    const { container } = render(<DiscountChips discounts={[]} currency="EUR" onRemove={vi.fn()} />);
    expect(container.textContent).toBe('');
  });

  it("shows a line discount's own display amount", () => {
    render(<DiscountChips discounts={discounts} currency="EUR" onRemove={vi.fn()}
      amounts={[{ discountId: 'd1', amountMinor: 250 }]} />);
    expect(screen.getByText('10% −€2.50')).toBeTruthy();
  });

  it('removing a chip calls onRemove with the discount id', () => {
    const onRemove = vi.fn();
    render(<DiscountChips discounts={discounts} currency="EUR" onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: /^Remove discount/ }));
    expect(onRemove).toHaveBeenCalledWith('d1');
  });
});
