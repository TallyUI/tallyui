import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { formatMoney } from '@tallyui/core';
import { parsePrice, PriceForm } from '../sale/price-form';

afterEach(() => cleanup());

describe('parsePrice', () => {
  it.each([
    ['12.50', 'EUR', 1250], ['12,5', 'EUR', 1250], ['0', 'EUR', 0],
    ['', 'EUR', 'Enter a price.'], ['abc', 'EUR', 'Enter a number.'],
    ['-1', 'EUR', 'Enter a price of 0 or more.'],
    ['1.234', 'EUR', 'Use at most 2 decimal places.'],
    ['12.5', 'JPY', 'Use a whole amount.'], ['12', 'JPY', 12],
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

  it('closes on Cancel without applying', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(<PriceForm lineName="Shirt" currency="EUR" currentMinor={1500} onApply={onApply} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('price-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });
});
