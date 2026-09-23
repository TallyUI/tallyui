import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CashTendered } from '../checkout/cash-tendered';

const total = { amount: 3451, currency: 'EUR' };

describe('CashTendered', () => {
  it('renders sorted, deduplicated quick amounts', () => {
    const { container } = render(<CashTendered total={total} locale="en" />);
    expect(Array.from(container.querySelectorAll('[tabindex="0"]'), (button) => button.textContent)).toEqual(['€34.51', '€35.00', '€40.00']);
    expect(screen.getByRole('textbox').getAttribute('value')).toBe('34.51');
  });

  it('calls onChangeAmount with Money when a quick button is pressed', () => {
    const onChange = vi.fn();
    render(<CashTendered total={total} locale="en" onChangeAmount={onChange} />);
    fireEvent.click(screen.getByText('€35.00'));
    expect(onChange).toHaveBeenCalledWith({ amount: 3500, currency: 'EUR' });
    expect(screen.getByRole('textbox').getAttribute('value')).toBe('35.00');
  });

  it('accepts custom quick amounts', () => {
    render(<CashTendered total={total} quickAmounts={[{ amount: 5000, currency: 'EUR' }]} locale="en" />);
    expect(screen.getByText('€50.00')).toBeDefined();
    expect(screen.queryByText('€35.00')).toBeNull();
  });

  it('parses decimal text and ignores invalid edits', () => {
    const onChange = vi.fn();
    render(<CashTendered total={total} locale="en" onChangeAmount={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '50' } });
    expect(onChange).toHaveBeenLastCalledWith({ amount: 5000, currency: 'EUR' });
    expect(input.getAttribute('value')).toBe('50.00');
    fireEvent.change(input, { target: { value: '12.345' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((input as HTMLInputElement).value).toBe('50.00');
  });

  it('supports default and controlled Money amounts', () => {
    const onChange = vi.fn();
    const { rerender } = render(<CashTendered total={total} defaultAmount={{ amount: 4000, currency: 'EUR' }} locale="en" />);
    expect(screen.getByRole('textbox').getAttribute('value')).toBe('40.00');
    rerender(<CashTendered total={total} amount={{ amount: 5000, currency: 'EUR' }} onChangeAmount={onChange} locale="en" />);
    fireEvent.click(screen.getByText('€35.00'));
    expect(onChange).toHaveBeenCalledWith({ amount: 3500, currency: 'EUR' });
    expect(screen.getByRole('textbox').getAttribute('value')).toBe('50.00');
  });

  it('uses currency minor-unit digits for input and quick amounts', () => {
    render(<CashTendered total={{ amount: 101, currency: 'JPY' }} locale="en" />);
    expect(screen.getByRole('textbox').getAttribute('value')).toBe('101');
    expect(screen.getByText('¥105')).toBeDefined();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '1.5' } });
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('101');
  });
});
