import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MoneyFormatProvider } from '@tallyui/core';
import { I18nProvider } from '../i18n';
import { ChargeForm, type ChargeFormProps } from '../sale/charge-form';

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

  it.each([['fee', 'Add fee'], ['shipping', 'Add shipping'], ['custom', 'Add custom item']] as const)(
    'with kind %s, applies that kind without the kind row', (kind, name) => {
      const onApply = vi.fn().mockReturnValue(null);
      render(<ChargeForm currency="EUR" kind={kind} onApply={onApply} onClose={() => {}} />);
      for (const label of ['Fee', 'Shipping', 'Custom item']) expect(screen.queryByRole('button', { name: label })).toBeNull();
      expect(screen.getByRole('group', { name })).toBeTruthy();
      input('Name', 'Wrapping');
      input('Amount', '1');
      click('Apply');
      expect(onApply).toHaveBeenCalledExactlyOnceWith({ kind, name: 'Wrapping', amountMinor: 100,
        taxStatus: undefined, taxClass: undefined });
    });

  it('shows the store shipping tax notice for kind shipping', () => {
    render(<ChargeForm currency="EUR" kind="shipping" shippingTaxFromStore onApply={() => null} onClose={() => {}} />);
    expect(screen.getByText("Shipping is taxed at the store's shipping tax class.")).toBeTruthy();
  });

  it('without kind, is named Add charge and shows the kind row', () => {
    render(<ChargeForm currency="EUR" onApply={() => null} onClose={() => {}} />);
    expect(screen.getByRole('group', { name: 'Add charge' })).toBeTruthy();
    for (const label of ['Fee', 'Shipping', 'Custom item']) expect(screen.getByRole('button', { name: label })).toBeTruthy();
  });

  it.each([
    ['Bag', '', 'Enter a price.'], ['Bag', 'abc', 'Enter a number.'],
    ['Bag', '-1', 'A fee cannot be negative. Use Add Discount instead.'], ['Bag', '1.234', 'Use at most 2 decimal places.'],
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

  it("a blank name applies the kind's v2 default", () => {
    for (const [kind, name] of [['fee', 'Fee'], ['shipping', 'Shipping'], ['custom', 'Product']] as const) {
      const onApply = vi.fn().mockReturnValue(null);
      render(<ChargeForm currency="EUR" kind={kind} onApply={onApply} onClose={() => {}} />);
      input('Name', ' ');
      input('Amount', '1');
      click('Apply');
      expect(onApply).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind, name }));
      cleanup();
    }
  });

  it("a fee refuses a negative amount with v2's message", () => {
    for (const [kind, message] of [['fee', 'A fee cannot be negative. Use Add Discount instead.'],
      ['shipping', 'Enter a price of 0 or more.']] as const) {
      const onApply = vi.fn().mockReturnValue(null);
      render(<ChargeForm currency="EUR" kind={kind} onApply={onApply} onClose={() => {}} />);
      input('Name', 'Bag');
      input('Amount', '-2');
      click('Apply');
      expect(screen.getByRole('alert').textContent).toBe(message);
      expect(onApply).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it('a zero fee is refused, zero shipping and a zero custom item apply', () => {
    for (const kind of ['fee', 'shipping', 'custom'] as const) {
      const onApply = vi.fn().mockReturnValue(null);
      render(<ChargeForm currency="EUR" kind={kind} onApply={onApply} onClose={() => {}} />);
      input('Name', 'Bag');
      input('Amount', '0');
      click('Apply');
      if (kind === 'fee') {
        expect(screen.getByRole('alert').textContent).toBe('Enter an amount greater than zero');
        expect(onApply).not.toHaveBeenCalled();
      } else expect(onApply).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind, amountMinor: 0 }));
      cleanup();
    }
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
    input('Amount', '1');
    fireEvent.click(screen.getByRole('switch', { name: 'No tax' }));
    click('Reduced');
    expect(screen.getByRole('switch', { name: 'No tax' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('button', { name: 'Reduced' }).getAttribute('aria-selected')).toBe('true');
    click('Apply');
    expect(onApply).toHaveBeenLastCalledWith({ kind: 'fee', name: 'Bag', amountMinor: 100, taxStatus: 'none', taxClass: 'reduced' });
    fireEvent.click(screen.getByRole('switch', { name: 'No tax' }));
    click('No class');
    expect(screen.getByRole('switch', { name: 'No tax' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('button', { name: 'Reduced' }).getAttribute('aria-selected')).toBe('false');
    click('Apply');
    expect(onApply).toHaveBeenLastCalledWith({ kind: 'fee', name: 'Bag', amountMinor: 100, taxStatus: undefined, taxClass: undefined });
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

  describe('No tax on store-taxed shipping with shippingNoTax (#1115)', () => {
    const STORE_NOTE = "Shipping is taxed at the store's shipping tax class.";
    const noTax = () => screen.getByRole('switch', { name: 'No tax' });
    const mountShipping = (props: Partial<ChargeFormProps> = {}) => {
      const onApply = vi.fn().mockReturnValue(null);
      render(<ChargeForm currency="EUR" kind="shipping" shippingTaxFromStore shippingNoTax {...props} onApply={onApply} onClose={() => {}} />);
      return onApply;
    };

    it('C1: shows the No tax switch and no Tax class group, and sends taxStatus none', () => {
      const onApply = mountShipping();
      expect(noTax()).toBeTruthy();
      expect(screen.queryByRole('group', { name: 'Tax class' })).toBeNull();
      input('Name', 'Delivery');
      input('Amount', '2');
      fireEvent.click(noTax());
      click('Apply');
      expect(onApply).toHaveBeenCalledExactlyOnceWith({ kind: 'shipping', name: 'Delivery', amountMinor: 200,
        taxStatus: 'none', taxClass: undefined });
    });

    it('C2: applied without toggling, the line stays taxable', () => {
      const onApply = mountShipping();
      input('Name', 'Delivery');
      input('Amount', '2');
      click('Apply');
      expect(onApply).toHaveBeenCalledExactlyOnceWith({ kind: 'shipping', name: 'Delivery', amountMinor: 200,
        taxStatus: undefined, taxClass: undefined });
    });

    it('C3: an untaxed line opens with the switch on, and toggled off it applies taxable', () => {
      const onApply = mountShipping({ initial: { name: 'Courier', amountMinor: 500, taxStatus: 'none' } });
      expect(noTax().getAttribute('aria-checked')).toBe('true');
      fireEvent.click(noTax());
      click('Apply');
      expect(onApply).toHaveBeenCalledExactlyOnceWith({ kind: 'shipping', name: 'Courier', amountMinor: 500,
        taxStatus: undefined, taxClass: undefined });
    });

    it('C4: the store notice shows while No tax is off and is gone once it is on', () => {
      mountShipping();
      expect(screen.getByText(STORE_NOTE)).toBeTruthy();
      fireEvent.click(noTax());
      expect(screen.queryByText(STORE_NOTE)).toBeNull();
      fireEvent.click(noTax());
      expect(screen.getByText(STORE_NOTE)).toBeTruthy();
    });

    it('C5: without kind the form opens on Fee with no No tax switch; Shipping shows it', () => {
      mountShipping({ kind: undefined });
      expect(screen.getByRole('button', { name: 'Fee' }).getAttribute('aria-selected')).toBe('true');
      expect(screen.queryByRole('switch', { name: 'No tax' })).toBeNull();
      click('Shipping');
      expect(noTax()).toBeTruthy();
    });

    it("C6: turning No tax on keeps the line's own tax class", () => {
      const onApply = mountShipping({ lineTax: { none: true, classes: true },
        initial: { name: 'Delivery', amountMinor: 200, taxClass: 'reduced-rate' } });
      fireEvent.click(noTax());
      click('Apply');
      expect(onApply).toHaveBeenCalledExactlyOnceWith({ kind: 'shipping', name: 'Delivery', amountMinor: 200,
        taxStatus: 'none', taxClass: 'reduced-rate' });
    });

    it('C7: without shippingTaxFromStore, No tax follows lineTax.none, not shippingNoTax', () => {
      mountShipping({ shippingTaxFromStore: undefined, lineTax: { none: false, classes: true }, taxClasses });
      expect(screen.queryByRole('switch', { name: 'No tax' })).toBeNull();
      expect(screen.getByRole('group', { name: 'Tax class' })).toBeTruthy();
    });
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

  it("shows visible Name and Amount labels, translatable by the app's catalogue", () => {
    render(<ChargeForm currency="EUR" onApply={() => null} onClose={() => {}} />);
    for (const name of ['Name', 'Amount']) expect(screen.getByText(name)).toBeTruthy();
    for (const name of ['Name', 'Amount']) expect(screen.getByRole('textbox', { name })).toBeTruthy();
    cleanup();
    render(<I18nProvider locale="fr" resources={{ fr: { 'common.name': 'Nom', 'common.amount': 'Montant' } }}>
      <ChargeForm currency="EUR" onApply={() => null} onClose={() => {}} /></I18nProvider>);
    for (const name of ['Nom', 'Montant']) expect(screen.getByText(name)).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Montant' })).toBeTruthy();
  });

  it("shows the sale currency's symbol as the amount affix, never a hard-coded code", () => {
    const onApply = vi.fn().mockReturnValue(null);
    render(<ChargeForm currency="GBP" onApply={onApply} onClose={() => {}} />);
    expect(screen.getByTestId('charge-form-currency').textContent).toBe('£');
    expect(screen.getByRole('textbox', { name: 'Amount' }).hasAttribute('placeholder')).toBe(false);
    for (const currency of ['EUR', '€']) expect(screen.queryByText(currency)).toBeNull();
    input('Name', 'Bag');
    input('Amount', '12.34');
    click('Apply');
    expect(onApply).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: 'Bag', amountMinor: 1234 }));
  });

  describe('percent and Amount Includes Tax (vendurepos gap 2.10)', () => {
    const includesTax = () => screen.queryByRole('switch', { name: 'Amount Includes Tax' });
    const unit = (which: 'amount' | 'percent') => fireEvent.click(screen.getByTestId(`charge-form-unit-${which}`));
    const NEGATIVE = 'A fee cannot be negative. Use Add Discount instead.';

    it('F1: without the new props, no % button and no Amount Includes Tax switch', () => {
      render(<ChargeForm currency="EUR" onApply={() => null} onClose={() => {}} />);
      for (const kind of ['Fee', 'Shipping']) {
        click(kind);
        expect(screen.queryByRole('button', { name: '%' })).toBeNull();
        expect(includesTax()).toBeNull();
      }
    });

    it('F2: a fee at % applies amountMinor 0 and the percent, without amountIncludesTax', () => {
      const onApply = vi.fn().mockReturnValue(null);
      render(<ChargeForm currency="EUR" allowPercent onApply={onApply} onClose={() => {}} />);
      expect(screen.getByTestId('charge-form-unit-amount').textContent).toBe('€');
      unit('percent');
      expect(screen.getByTestId('charge-form-unit-percent').getAttribute('aria-selected')).toBe('true');
      expect(screen.getByTestId('charge-form-currency').textContent).toBe('%');
      input('Amount', '12,5');
      click('Apply');
      expect(onApply).toHaveBeenCalledExactlyOnceWith({ kind: 'fee', name: 'Fee', amountMinor: 0, percent: 12.5,
        taxStatus: undefined, taxClass: undefined });
      expect(Object.keys(onApply.mock.calls[0][0])).not.toContain('amountIncludesTax');
    });

    it('F3: leaving Fee hides the toggle and parses the amount as money', () => {
      const onApply = vi.fn().mockReturnValue(null);
      render(<ChargeForm currency="EUR" allowPercent onApply={onApply} onClose={() => {}} />);
      unit('percent');
      click('Shipping');
      expect(screen.queryByRole('button', { name: '%' })).toBeNull();
      input('Amount', '3');
      click('Apply');
      expect(onApply).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'shipping', amountMinor: 300 }));
      expect(Object.keys(onApply.mock.calls[0][0])).not.toContain('percent');
    });

    it.each([['', 'Enter an amount greater than zero'], ['0', 'Enter an amount greater than zero'], ['-5', NEGATIVE]])(
      'F4: a percent of %j is refused', (amount, message) => {
        const onApply = vi.fn().mockReturnValue(null);
        render(<ChargeForm currency="EUR" allowPercent onApply={onApply} onClose={() => {}} />);
        unit('percent');
        input('Amount', amount);
        click('Apply');
        expect(screen.getByRole('alert').textContent).toBe(message);
        expect(onApply).not.toHaveBeenCalled();
      });

    it.each([true, false])('F5: with pricesIncludeTax %s, fee and shipping show the switch at the store mode', (store) => {
      const onApply = vi.fn().mockReturnValue(null);
      render(<ChargeForm currency="EUR" pricesIncludeTax={store} onApply={onApply} onClose={() => {}} />);
      for (const kind of ['Fee', 'Shipping']) {
        click(kind);
        expect(includesTax()!.getAttribute('aria-checked')).toBe(String(store));
        input('Amount', '1');
        click('Apply');
        expect(Object.keys(onApply.mock.lastCall![0])).not.toContain('amountIncludesTax');
        fireEvent.click(includesTax()!);
        click('Apply');
        expect(onApply.mock.lastCall![0]).toMatchObject({ amountIncludesTax: !store });
        fireEvent.click(includesTax()!);
      }
      click('Custom item');
      expect(includesTax()).toBeNull();
    });

    it('F6: editing a percent fee starts on % without the switch', () => {
      const onApply = vi.fn().mockReturnValue(null);
      render(<ChargeForm currency="EUR" kind="fee" allowPercent pricesIncludeTax
        initial={{ name: 'Service', amountMinor: 500, percent: 10, amountIncludesTax: false }} onApply={onApply} onClose={() => {}} />);
      expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Amount' }).value).toBe('10');
      expect(screen.getByTestId('charge-form-unit-percent').getAttribute('aria-selected')).toBe('true');
      expect(includesTax()).toBeNull();
      click('Apply');
      expect(onApply.mock.lastCall![0]).toMatchObject({ amountMinor: 0, percent: 10 });
      expect(Object.keys(onApply.mock.lastCall![0])).not.toContain('amountIncludesTax');
      unit('amount');
      expect(includesTax()!.getAttribute('aria-checked')).toBe('false');
      input('Amount', '2');
      click('Apply');
      expect(onApply.mock.lastCall![0]).toMatchObject({ amountMinor: 200 });
      expect(Object.keys(onApply.mock.lastCall![0])).not.toContain('percent');
    });

    it("F7: without the new props, an edit keeps the charge's percent and mode", () => {
      const onApply = vi.fn().mockReturnValue(null);
      render(<ChargeForm currency="EUR" kind="fee"
        initial={{ name: 'Service', amountMinor: 500, percent: 10, amountIncludesTax: false }} onApply={onApply} onClose={() => {}} />);
      click('Apply');
      expect(onApply.mock.lastCall![0]).toMatchObject({ percent: 10, amountIncludesTax: false });
    });

    it('F8: a fee switched to % hides the switch and sends no amountIncludesTax; back to the amount, it shows again', () => {
      const onApply = vi.fn().mockReturnValue(null);
      render(<ChargeForm currency="EUR" kind="fee" allowPercent pricesIncludeTax={false} onApply={onApply} onClose={() => {}} />);
      fireEvent.click(includesTax()!);
      expect(includesTax()!.getAttribute('aria-checked')).toBe('true');
      unit('percent');
      expect(includesTax()).toBeNull();
      input('Amount', '10');
      click('Apply');
      expect(onApply.mock.lastCall![0]).toMatchObject({ amountMinor: 0, percent: 10 });
      expect(Object.keys(onApply.mock.lastCall![0])).not.toContain('amountIncludesTax');
      unit('amount');
      expect(includesTax()).not.toBeNull();
    });

    it("F9: editing a fee with its own mode to % drops the charge's amountIncludesTax", () => {
      const onApply = vi.fn().mockReturnValue(null);
      render(<ChargeForm currency="EUR" kind="fee" allowPercent pricesIncludeTax={false}
        initial={{ name: 'Wrap', amountMinor: 100, amountIncludesTax: true }} onApply={onApply} onClose={() => {}} />);
      expect(includesTax()!.getAttribute('aria-checked')).toBe('true');
      unit('percent');
      input('Amount', '5');
      click('Apply');
      expect(onApply.mock.lastCall![0]).toMatchObject({ amountMinor: 0, percent: 5 });
      expect(Object.keys(onApply.mock.lastCall![0])).not.toContain('amountIncludesTax');
    });
  });
});

describe('ChargeForm reads the store money format (#1086)', () => {
  const DOT = { decimalSeparator: '.', thousandSeparator: ',' };
  const COMMA = { decimalSeparator: ',', thousandSeparator: '.' };
  const mount = (format?: typeof COMMA, props: Partial<ChargeFormProps> = {}) => {
    const onApply = vi.fn().mockReturnValue(null);
    const form = <ChargeForm currency="EUR" {...props} onApply={onApply} onClose={() => {}} />;
    render(format ? <MoneyFormatProvider format={format}>{form}</MoneyFormatProvider> : form);
    return onApply;
  };
  const amount = () => screen.getByRole('textbox', { name: 'Amount' }) as HTMLInputElement;

  it('CF1: COMMA reads a grouped fee', () => {
    const onApply = mount(COMMA);
    input('Amount', '1.234,50');
    click('Apply');
    expect(onApply.mock.lastCall![0]).toMatchObject({ kind: 'fee', amountMinor: 123450 });
  });

  it.each([
    ['CF2', COMMA, 'EUR', '1.234.56'],
    ['CF3', DOT, 'KWD', '0,500'],
  ] as const)('%s: refuses %j in %j %s', (_id, format, currency, text) => {
    const onApply = mount(format, { currency });
    input('Amount', text);
    click('Apply');
    expect(screen.getByRole('alert').textContent).toBe('Enter a number.');
    expect(onApply).not.toHaveBeenCalled();
  });

  it("CF4: without a provider '1,5' is 150 and '1.234,50' is refused", () => {
    const onApply = mount();
    input('Amount', '1,5');
    click('Apply');
    expect(onApply.mock.lastCall![0]).toMatchObject({ amountMinor: 150 });
    cleanup();
    const refused = mount();
    input('Amount', '1.234,50');
    click('Apply');
    expect(screen.getByRole('alert').textContent).toBe('Enter a number.');
    expect(refused).not.toHaveBeenCalled();
  });

  it('CF5: COMMA prefills an edited amount in its separator, so a typed digit is a third decimal place', () => {
    const onApply = mount(COMMA, { initial: { name: 'Wrap', amountMinor: 1250 } });
    expect(amount().value).toBe('12,50');
    input('Amount', amount().value + '5');
    click('Apply');
    expect(screen.getByRole('alert').textContent).toBe('Use at most 2 decimal places.');
    expect(onApply).not.toHaveBeenCalled();
  });

  it('CF6: COMMA reads a grouped negative fee as negative', () => {
    const onApply = mount(COMMA);
    input('Amount', '-1.234,50');
    click('Apply');
    expect(screen.getByRole('alert').textContent).toBe('A fee cannot be negative. Use Add Discount instead.');
    expect(onApply).not.toHaveBeenCalled();
  });
});
