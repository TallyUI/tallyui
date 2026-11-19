import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { formatMoney, MoneyFormatProvider } from '@tallyui/core';
import { parsePrice, PriceForm } from '../sale/price-form';

afterEach(() => cleanup());

describe('parsePrice', () => {
  it.each([
    ['12.50', 'EUR', 1250], ['12,5', 'EUR', 1250], ['0', 'EUR', 0],
    ['', 'EUR', 'Enter a price.'], ['abc', 'EUR', 'Enter a number.'],
    ['-1', 'EUR', 'Enter a price of 0 or more.'],
    ['1.234', 'EUR', 'Use at most 2 decimal places.'],
    ['12.5', 'JPY', 'Use a whole amount.'], ['12', 'JPY', 12],
    ['1.234', 'KWD', 1234],
    ['1.2345', 'KWD', 'Use at most 3 decimal places.'],
    ['0.005', 'BHD', 5],
  ])('parses %s in %s', (text, currency, expected) => {
    expect(parsePrice(text as string, currency as string)).toBe(expected);
  });
});

describe('PriceForm', () => {
  it('shows the current price, starts empty, and applies the price with a trimmed reason', () => {
    const onApply = vi.fn().mockReturnValue(null);
    const onClose = vi.fn();
    render(<PriceForm lineName="Shirt" currency="EUR" currentMinor={1500} onApply={onApply} onClose={onClose} />);
    expect(screen.getByRole('group', { name: 'Price for Shirt' })).toBe(screen.getByTestId('price-form'));
    expect(screen.getByText(formatMoney({ amount: 1500, currency: 'EUR' })!)).toBeTruthy();
    expect((screen.getByTestId('price-input') as HTMLInputElement).value).toBe('');
    fireEvent.change(screen.getByTestId('price-input'), { target: { value: '12.50' } });
    fireEvent.change(screen.getByTestId('price-reason'), { target: { value: ' Damaged ' } });
    fireEvent.click(screen.getByTestId('price-apply'));
    expect(onApply).toHaveBeenCalledWith(1250, 'Damaged');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a refusal inline without closing, and omits a blank reason', () => {
    const onApply = vi.fn().mockReturnValue('This sale is being saved. Retry to finish it.');
    const onClose = vi.fn();
    render(<PriceForm lineName="Shirt" currency="EUR" currentMinor={1500} onApply={onApply} onClose={onClose} />);
    fireEvent.change(screen.getByTestId('price-input'), { target: { value: '0' } });
    fireEvent.change(screen.getByTestId('price-reason'), { target: { value: '  ' } });
    fireEvent.click(screen.getByTestId('price-apply'));
    expect(onApply).toHaveBeenCalledWith(0, undefined);
    expect(screen.getByTestId('price-error').textContent).toBe('This sale is being saved. Retry to finish it.');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows a parse error without applying or closing', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(<PriceForm lineName="Shirt" currency="EUR" currentMinor={1500} onApply={onApply} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('price-apply'));
    expect(screen.getByTestId('price-error').textContent).toBe('Enter a price.');
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each([[undefined], [[]], [[0, 150, Number.NaN]]])('draws no quick keys for %j', (quickDiscounts) => {
    render(<PriceForm lineName="Shirt" currency="EUR" currentMinor={1250} quickDiscounts={quickDiscounts}
      onApply={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByTestId('price-quick-discounts')).toBeNull();
  });

  it("draws v2's first three keys in order, lights the pressed one and applies the price less its percent", () => {
    const onApply = vi.fn().mockReturnValue(null);
    render(<PriceForm lineName="Shirt" currency="EUR" currentMinor={1250} quickDiscounts={[5, 10, 15, 20]}
      onApply={onApply} onClose={vi.fn()} />);
    const keys = screen.getAllByRole('button').filter((key) => key.getAttribute('aria-label')?.startsWith('Discount'));
    expect(keys.map((key) => [key.textContent, key.getAttribute('aria-label')]))
      .toEqual([['−5%', 'Discount (5%)'], ['−10%', 'Discount (10%)'], ['−15%', 'Discount (15%)']]);
    const selected = () => keys.map((key) => key.getAttribute('aria-selected'));
    fireEvent.click(screen.getByTestId('price-discount-10'));
    expect(selected()).toEqual(['false', 'true', 'false']);
    expect(screen.getByTestId('price-quick-draft').textContent)
      .toBe(`${formatMoney({ amount: 1250, currency: 'EUR' })} −10% → ${formatMoney({ amount: 1125, currency: 'EUR' })}`);
    fireEvent.click(screen.getByTestId('price-discount-10'));
    expect(selected()).toEqual(['false', 'false', 'false']);
    expect(screen.queryByTestId('price-quick-draft')).toBeNull();
    fireEvent.click(screen.getByTestId('price-discount-10'));
    fireEvent.click(screen.getByTestId('price-apply'));
    expect(onApply).toHaveBeenCalledExactlyOnceWith(1125, undefined);
  });

  it('typing after a key starts over with the typed price', () => {
    const onApply = vi.fn().mockReturnValue(null);
    render(<PriceForm lineName="Shirt" currency="EUR" currentMinor={1250} quickDiscounts={[10]} onApply={onApply} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('price-discount-10'));
    fireEvent.change(screen.getByTestId('price-input'), { target: { value: '9' } });
    expect(screen.getByTestId('price-discount-10').getAttribute('aria-selected')).toBe('false');
    fireEvent.click(screen.getByTestId('price-apply'));
    expect(onApply).toHaveBeenCalledExactlyOnceWith(900, undefined);
  });

  // 1999 × 0.875 = 1749.125; 1250 × 0.95 = 1187.5, half up.
  it.each([[1999, 12.5, 1749], [1250, 5, 1188]])('rounds %i less %s percent to %i minor units', (currentMinor, percent, expected) => {
    const onApply = vi.fn().mockReturnValue(null);
    render(<PriceForm lineName="Shirt" currency="EUR" currentMinor={currentMinor} quickDiscounts={[percent]} onApply={onApply} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId(`price-discount-${percent}`));
    fireEvent.click(screen.getByTestId('price-apply'));
    expect(onApply).toHaveBeenCalledExactlyOnceWith(expected, undefined);
  });

  it('closes on Cancel without applying', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(<PriceForm lineName="Shirt" currency="EUR" currentMinor={1500} onApply={onApply} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('price-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe('parsePrice with the store separators (#672)', () => {
  const DOT = { decimalSeparator: '.', thousandSeparator: ',' };
  const COMMA = { decimalSeparator: ',', thousandSeparator: '.' };

  it('PF1: reads grouped amounts and still refuses extra places', () => {
    expect(parsePrice('1.234,50', 'EUR', COMMA)).toBe(123450);
    expect(parsePrice('1,234.50', 'USD', DOT)).toBe(123450);
    // A lone separator before exactly 3 digits is grouping in every currency (#1073).
    expect(parsePrice('1,000', 'USD', DOT)).toBe(100000);
    expect(parsePrice('1,000', 'JPY', DOT)).toBe(1000);
    expect(parsePrice('12.345', 'USD', DOT)).toBe('Use at most 2 decimal places.');
    expect(parsePrice('1,000', 'KWD', DOT)).toBe(1000000);
  });

  const APOS = { decimalSeparator: '.', thousandSeparator: "'" };
  const REFUSED = [
    ['1..50', DOT], ['9.99.', DOT], ['12..5', DOT], ['0.5.0', DOT], ['1,234,56', DOT], ['1.234.56', DOT],
    ['1.234.56', COMMA], ['1,23.45', DOT],
  ] as const;

  it.each(REFUSED)('C1: refuses the ambiguous %j in %j like any non-number (#1073)', (text, format) => {
    for (const currency of ['USD', 'JPY', 'KWD']) expect(parsePrice(text, currency, format)).toBe('Enter a number.');
  });

  it.each([['1234,567', DOT], ['1,5', APOS]] as const)('C1: the comma fallback does not read the refused %j in %j', (text, format) => {
    expect(parsePrice(text, 'KWD', format)).toBe('Enter a number.');
  });

  // KWD is left out on purpose: rule 3(a) reads a DOT store's '1,234' in a 3-decimal currency as 1234.000, where
  // main read 1.234 (#1073). Every other input main accepted must read the same with the default separators.
  it('N4: with the default separators, every input main accepted reads the same in USD, EUR and JPY', () => {
    const NNBSP = ' ';
    const inputs = ['1,234.56', '1.234,56', '1,5', '1.5', '1.234', '1,234', '1,234,567', '1.234.567', '-12,5', '-1.234,56',
      '.5', ',5', '1.', '1,', '', ' ', '-', '1 234,56', `1${NNBSP}234,56`, "1'234.56", "1'234", '€12,50', '12,50 €', '$ 12.50', ' 12.50 ',
      '12..5', '1..50', '9.99.', '1,,5', '1,2,3', '1.2.3', '12.3.4', '0.5.0', '1.234.56', '1,234,56', '1e3', '0x10', '+5', '١٢٣', '１２',
      '1,234.50', '12,75', 'abc', '-1',
      '12', '1000']; // Two whole amounts, so JPY is not vacuous.
    let accepted = 0;
    for (const text of inputs) {
      for (const currency of ['USD', 'EUR', 'JPY']) {
        const main = parsePrice(text, currency);
        if (typeof main !== 'number') continue;
        accepted += 1;
        expect([text, currency, parsePrice(text, currency, DOT)]).toEqual([text, currency, main]);
      }
    }
    expect(accepted).toBeGreaterThan(5);
  });

  it.each([
    ['1,234.50', 'Enter a number.'], ['1,5', 150], ['.5', 'Enter a number.'], ['12,75', 1275],
    ['', 'Enter a price.'], ['abc', 'Enter a number.'], ['-1', 'Enter a price of 0 or more.'],
  ])('PF2: without a format parses %j as today', (text, expected) => {
    expect(parsePrice(text, 'USD')).toBe(expected);
    expect(parsePrice(text, 'USD', undefined)).toBe(expected);
  });

  it('PF3: PriceForm reads the provider format', () => {
    const onApply = vi.fn().mockReturnValue(null);
    render(<MoneyFormatProvider format={COMMA}>
      <PriceForm lineName="Shirt" currency="EUR" currentMinor={1500} onApply={onApply} onClose={vi.fn()} />
    </MoneyFormatProvider>);
    fireEvent.change(screen.getByTestId('price-input'), { target: { value: '1.234,50' } });
    fireEvent.click(screen.getByTestId('price-apply'));
    expect(onApply).toHaveBeenCalledWith(123450, undefined);
  });
});
