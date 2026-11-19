import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { PortalHost } from '@tallyui/primitives';
import type { AppliedDiscount } from '@tallyui/pos';
import { DiscountChips, DiscountForm, discountLabel, parseDiscount, type DiscountCoupon } from '../sale/discount-form';

// react-native-web 0.21 drops accessibilityHint from the DOM, so the real IconButton renders through a wrapper that
// records the props it was given, by testID.
const iconButtonProps = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('../ui/icon-button', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ui/icon-button')>();
  const { createElement } = await import('react');
  return { ...actual, IconButton: (props: Record<string, unknown>) => {
    iconButtonProps.set(String(props.testID), props);
    return createElement(actual.IconButton, props);
  } };
});

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

describe('DiscountForm coupon tab', () => {
  const COUPONS: DiscountCoupon[] = [
    { code: 'SUMMER10', detail: 'Summer sale', amountLabel: '10%' },
    { code: 'FIVEOFF', detail: 'Fixed cart discount', amountLabel: '€5.00' },
    { code: 'VIP', amountLabel: '20%' },
  ];
  const press = (testID: string) => fireEvent.click(screen.getByTestId(testID));
  function renderTabs(onApplyCoupon: (code: string) => Promise<string | null> = vi.fn().mockResolvedValue(null), coupons = COUPONS) {
    const onClose = vi.fn();
    render(<><DiscountForm layout="dialog" currency="EUR" onApply={vi.fn()} onClose={onClose}
      onApplyCoupon={onApplyCoupon} coupons={coupons} /><PortalHost /></>);
    press('add-discount-kind-coupon');
    return onClose;
  }
  const submit = () => screen.getByTestId('add-coupon-submit');
  const pick = (code: string) => { press('add-coupon-combobox'); press(`add-coupon-option-${code}`); };
  const search = (text: string) => fireEvent.change(screen.getByTestId('add-coupon-search-input'), { target: { value: text } });
  const optionCodes = () => screen.queryAllByTestId(/^add-coupon-option-/).map((row) => row.getAttribute('data-testid')!.slice('add-coupon-option-'.length));

  it('dialog without onApplyCoupon: no Quick discount / Coupon tabs, today\'s body', () => {
    render(<DiscountForm layout="dialog" currency="EUR" onApply={vi.fn()} onClose={vi.fn()} coupons={COUPONS} />);
    expect(screen.queryByTestId('add-discount-kind-quick')).toBeNull();
    expect(screen.queryByTestId('add-discount-kind-coupon')).toBeNull();
    expect(screen.queryByText('Quick discount')).toBeNull();
    expect(screen.getByTestId('discount-amount-input')).toBeTruthy();
    expect(screen.getByTestId('add-discount-submit')).toBeTruthy();
  });

  it('dialog with onApplyCoupon: tabs start on Quick discount; Coupon shows the coupon picker', () => {
    render(<><DiscountForm layout="dialog" currency="EUR" onApply={vi.fn()} onClose={vi.fn()}
      onApplyCoupon={vi.fn()} /><PortalHost /></>);
    expect(screen.getByTestId('add-discount-kind-quick').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('add-discount-kind-coupon').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Quick discount')).toBeTruthy();
    expect(screen.getByTestId('discount-amount-input')).toBeTruthy();
    expect(screen.getByTestId('add-discount-submit')).toBeTruthy();
    expect(screen.queryByTestId('add-coupon-combobox')).toBeNull();
    press('add-discount-kind-coupon');
    expect(screen.getByTestId('add-discount-kind-coupon').getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByTestId('discount-amount-input')).toBeNull();
    expect(screen.getByTestId('add-coupon-combobox').textContent).toBe('Select coupon...');
    expect(screen.getAllByText('Coupon')).toHaveLength(2); // the tab and the row label
    // coupons defaults to []: the picker opens on the empty state.
    press('add-coupon-combobox');
    expect(screen.getByTestId('add-coupon-search-input').getAttribute('placeholder')).toBe('Search coupons...');
    expect(screen.getByText('No coupons found')).toBeTruthy();
  });

  it('Apply is disabled until a coupon is picked', async () => {
    const onApplyCoupon = vi.fn().mockResolvedValue(null);
    renderTabs(onApplyCoupon);
    expect(submit().getAttribute('aria-disabled')).toBe('true');
    await act(async () => { fireEvent.click(submit()); });
    expect(onApplyCoupon).not.toHaveBeenCalled();
    pick('FIVEOFF');
    expect(screen.getByTestId('add-coupon-combobox').textContent).toBe('FIVEOFF');
    expect(submit().getAttribute('aria-disabled')).toBeNull();
  });

  it('picking a coupon and Apply calls onApplyCoupon with its code and closes on null', async () => {
    const onApplyCoupon = vi.fn().mockResolvedValue(null);
    const onClose = renderTabs(onApplyCoupon);
    pick('SUMMER10');
    await act(async () => { fireEvent.click(submit()); });
    expect(onApplyCoupon).toHaveBeenCalledExactlyOnceWith('SUMMER10');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a refusal from onApplyCoupon shows inline and the dialog stays open', async () => {
    const onClose = renderTabs(vi.fn().mockResolvedValue('Coupon "VIP" has expired.'));
    pick('VIP');
    await act(async () => { fireEvent.click(submit()); });
    expect(screen.getByRole('alert').textContent).toBe('Coupon "VIP" has expired.');
    expect(onClose).not.toHaveBeenCalled();
    expect(submit().getAttribute('aria-disabled')).toBeNull();
    // Changing the pick clears the refusal (v2 add-coupon.tsx:62-67).
    pick('FIVEOFF');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a rejected onApplyCoupon shows "Failed to apply coupon."', async () => {
    const onClose = renderTabs(vi.fn().mockRejectedValue(new Error('network down')));
    pick('SUMMER10');
    await act(async () => { fireEvent.click(submit()); });
    expect(screen.getByRole('alert').textContent).toBe('Failed to apply coupon.');
    expect(onClose).not.toHaveBeenCalled();
    // Changing the search clears the error (v2 add-coupon.tsx:166-172).
    press('add-coupon-combobox');
    search('s');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Search coupons narrows the list by code or detail; no match shows No coupons found', () => {
    renderTabs();
    press('add-coupon-combobox');
    expect(optionCodes()).toEqual(['SUMMER10', 'FIVEOFF', 'VIP']);
    search('summer');
    expect(optionCodes()).toEqual(['SUMMER10']);
    search('CART');
    expect(optionCodes()).toEqual(['FIVEOFF']);
    search('nothing-like-it');
    expect(optionCodes()).toEqual([]);
    expect(screen.getByText('No coupons found')).toBeTruthy();
  });

  it('a row shows its code, detail and amountLabel', () => {
    renderTabs();
    press('add-coupon-combobox');
    const row = screen.getByTestId('add-coupon-option-SUMMER10');
    expect(row.textContent).toBe('SUMMER10Summer sale10%');
    expect(screen.getByTestId('add-coupon-option-VIP').textContent).toBe('VIP20%');
  });

  describe('New coupon button (v2 add-coupon.tsx:110-143)', () => {
    const OFFLINE = 'Coupons are created when the store is reachable';
    function renderNew(props: { onNewCoupon?: () => void; newCouponDisabledReason?: string }) {
      const onApplyCoupon = vi.fn().mockResolvedValue(null);
      const onClose = vi.fn();
      render(<><DiscountForm layout="dialog" currency="EUR" onApply={vi.fn()} onClose={onClose}
        onApplyCoupon={onApplyCoupon} coupons={COUPONS} {...props} /><PortalHost /></>);
      return { onApplyCoupon, onClose };
    }

    it('T1: without onNewCoupon there is no New coupon button', () => {
      renderNew({});
      press('add-discount-kind-coupon');
      expect(screen.getByTestId('add-coupon-combobox')).toBeTruthy();
      expect(screen.queryByTestId('add-coupon-new')).toBeNull();
    });

    it('T2: with onNewCoupon, "New coupon" calls it once and neither closes nor applies', () => {
      const onNewCoupon = vi.fn();
      const { onApplyCoupon, onClose } = renderNew({ onNewCoupon });
      press('add-discount-kind-coupon');
      const button = screen.getByRole('button', { name: 'New coupon' });
      expect(button).toBe(screen.getByTestId('add-coupon-new'));
      expect(button.getAttribute('aria-disabled')).toBeNull();
      expect(iconButtonProps.get('add-coupon-new')?.accessibilityHint).toBeUndefined();
      fireEvent.click(button);
      expect(onNewCoupon).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
      expect(onApplyCoupon).not.toHaveBeenCalled();
    });

    it('T3: with a disabled reason, the button is disabled, does nothing, and its hint is the reason', () => {
      const onNewCoupon = vi.fn();
      renderNew({ onNewCoupon, newCouponDisabledReason: OFFLINE });
      press('add-discount-kind-coupon');
      const button = screen.getByTestId('add-coupon-new');
      expect(button.getAttribute('aria-label')).toBe('New coupon');
      expect(button.getAttribute('aria-disabled')).toBe('true');
      fireEvent.click(button);
      expect(onNewCoupon).not.toHaveBeenCalled();
      expect(iconButtonProps.get('add-coupon-new')?.accessibilityHint).toBe(OFFLINE);
    });

    it('T4: the Quick discount tab never shows the New coupon button', () => {
      renderNew({ onNewCoupon: vi.fn() });
      expect(screen.getByTestId('discount-amount-input')).toBeTruthy();
      expect(screen.queryByTestId('add-coupon-new')).toBeNull();
      press('add-discount-kind-coupon');
      expect(screen.getByTestId('add-coupon-new')).toBeTruthy();
      press('add-discount-kind-quick');
      expect(screen.queryByTestId('add-coupon-new')).toBeNull();
    });

    it('T5: on web, a disabled button is described by a hidden element holding the reason (aria-describedby)', () => {
      renderNew({ onNewCoupon: vi.fn(), newCouponDisabledReason: OFFLINE });
      press('add-discount-kind-coupon');
      const describedBy = screen.getByTestId('add-coupon-new').getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy!)?.textContent).toBe(OFFLINE);
    });

    it('T6: an enabled button has no aria-describedby and no hidden reason', () => {
      renderNew({ onNewCoupon: vi.fn() });
      press('add-discount-kind-coupon');
      expect(screen.getByTestId('add-coupon-new').hasAttribute('aria-describedby')).toBe(false);
      expect(document.body.textContent).not.toContain(OFFLINE);
    });
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

describe('parseDiscount with the store separators (#672)', () => {
  const COMMA = { decimalSeparator: ',', thousandSeparator: '.' };

  it('DF1: reads the format, and without one is unchanged', () => {
    expect(parseDiscount('fixed', '1.234,50', 'EUR', COMMA)).toEqual({ type: 'fixed', value: 123450 });
    expect(parseDiscount('percentage', '12,75', 'EUR', COMMA)).toEqual({ type: 'percentage', value: 12.75 });
    expect(parseDiscount('fixed', '1,234.50', 'EUR')).toBe('Enter a number.');
  });
});
