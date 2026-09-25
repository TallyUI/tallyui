import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { AppliedDiscount } from '@tallyui/pos';
import { DiscountChips, DiscountForm, discountLabel } from '../sale/discount-form';

describe('discountLabel', () => {
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
