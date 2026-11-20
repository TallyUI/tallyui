import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MoneyFormatProvider } from '@tallyui/core';
import { CashTendered } from '../checkout/cash-tendered';

const total = { amount: 3451, currency: 'EUR' };

describe('CashTendered', () => {
  it('renders sorted, deduplicated quick amounts', () => {
    const { container } = render(<CashTendered total={total} locale="en" />);
    expect(Array.from(container.querySelectorAll('[tabindex="0"]'), (button) => button.textContent)).toEqual(['€34.51', '€35.00', '€40.00', '€50.00']);
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
    expect(input.getAttribute('value')).toBe('50');
    fireEvent.change(input, { target: { value: '12.345' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((input as HTMLInputElement).value).toBe('50');
  });

  it('keeps raw decimal text and emits only complete amounts', () => {
    const onChange = vi.fn();
    render(<CashTendered total={total} locale="en" onChangeAmount={onChange} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    for (const [text, calls] of [['3', 1], ['34', 2], ['34.', 2], ['34.5', 3], ['34.51', 4]] as const) {
      fireEvent.change(input, { target: { value: text } });
      expect(input.value).toBe(text);
      expect(onChange).toHaveBeenCalledTimes(calls);
    }
    expect(onChange).toHaveBeenLastCalledWith({ amount: 3451, currency: 'EUR' });
  });

  it('allows clearing the text without emitting and entering a new amount', () => {
    const onChange = vi.fn();
    render(<CashTendered total={total} onChangeAmount={onChange} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '3' } });
    expect(onChange).toHaveBeenLastCalledWith({ amount: 300, currency: 'EUR' });
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.change(input, { target: { value: '5' } });
    expect(input.value).toBe('5');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith({ amount: 500, currency: 'EUR' });
  });

  it('keeps the previous text when precision is exceeded or letters are entered', () => {
    const onChange = vi.fn();
    render(<CashTendered total={total} onChangeAmount={onChange} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '12.34' } });
    for (const text of ['12.345', 'abc']) {
      fireEvent.change(input, { target: { value: text } });
      expect(input.value).toBe('12.34');
      expect(onChange).toHaveBeenCalledTimes(1);
    }
  });

  it('replaces typed text with the formatted quick amount', () => {
    render(<CashTendered total={total} locale="en" />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '34.' } });
    expect(input.value).toBe('34.');
    fireEvent.click(screen.getByText('€40.00'));
    expect(input.value).toBe('40.00');
  });

  it('preserves typed text for its controlled amount and resyncs external amounts', () => {
    const onChange = vi.fn();
    const { rerender } = render(<CashTendered total={total} amount={total} onChangeAmount={onChange} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '34.5' } });
    expect(onChange).toHaveBeenLastCalledWith({ amount: 3450, currency: 'EUR' });
    rerender(<CashTendered total={total} amount={{ amount: 3450, currency: 'EUR' }} onChangeAmount={onChange} />);
    expect(input.value).toBe('34.5');
    rerender(<CashTendered total={total} amount={{ amount: 4000, currency: 'EUR' }} onChangeAmount={onChange} />);
    expect(input.value).toBe('40.00');
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

describe('CashTendered with the store separators (#672)', () => {
  it('CT1: keeps a comma amount inside a COMMA provider, and not without one', () => {
    const onChange = vi.fn();
    const { unmount } = render(<MoneyFormatProvider format={{ decimalSeparator: ',', thousandSeparator: '.' }}>
      <CashTendered total={total} locale="en" onChangeAmount={onChange} />
    </MoneyFormatProvider>);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '12,5' } });
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('12,5');
    expect(onChange).toHaveBeenLastCalledWith({ amount: 1250, currency: 'EUR' });
    unmount();
    const bare = vi.fn();
    render(<CashTendered total={total} locale="en" onChangeAmount={bare} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '12,5' } });
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('34.51');
    expect(bare).not.toHaveBeenCalled();
  });
});

describe('CashTendered refuses an ambiguous amount (#1073)', () => {
  const DOT = { decimalSeparator: '.', thousandSeparator: ',' };
  const COMMA = { decimalSeparator: ',', thousandSeparator: '.' };

  it.each([
    ['1..50', DOT], ['9.99.', DOT], ['12..5', DOT], ['0.5.0', DOT], ['1,234,56', DOT], ['1.234.56', DOT],
    ['1.234.56', COMMA], ['1,23.45', DOT],
  ] as const)('C1: emits no amount for %j in %j, so no change due shows', (text, format) => {
    const onChange = vi.fn();
    render(<MoneyFormatProvider format={format}>
      <CashTendered total={total} locale="en" onChangeAmount={onChange} />
    </MoneyFormatProvider>);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
    expect(onChange).not.toHaveBeenCalled();
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe(format.decimalSeparator === ',' ? '34,51' : '34.51');
  });
});

describe('CashTendered prefills in the store decimal separator (#1086)', () => {
  const COMMA = { decimalSeparator: ',', thousandSeparator: '.' };
  const eur = { amount: 1250, currency: 'EUR' };
  const mount = (format?: typeof COMMA, money = eur) => {
    const onChange = vi.fn();
    const field = () => screen.getByRole('textbox') as HTMLInputElement;
    render(format ? <MoneyFormatProvider format={format}><CashTendered total={money} locale="en" onChangeAmount={onChange} /></MoneyFormatProvider>
      : <CashTendered total={money} locale="en" onChangeAmount={onChange} />);
    return { onChange, field };
  };

  it('CT0: the prefill with a digit typed after it is never read as a thousands group', () => {
    const { onChange, field } = mount(COMMA);
    fireEvent.change(field(), { target: { value: field().value + '5' } });
    expect(onChange).not.toHaveBeenCalledWith({ amount: 1250500, currency: 'EUR' });
  });

  it('CT1: the field reads the total in the COMMA separator', () => {
    expect(mount(COMMA).field().value).toBe('12,50');
  });

  it('CT2: a third decimal place leaves the tendered amount unchanged', () => {
    const { onChange, field } = mount(COMMA);
    fireEvent.change(field(), { target: { value: '12,505' } });
    expect(field().value).toBe('12,50');
    expect(onChange).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalledWith({ amount: 1250500, currency: 'EUR' });
  });

  it('CT3: a trailing COMMA separator is kept as typed', () => {
    const { field } = mount(COMMA);
    fireEvent.change(field(), { target: { value: '12,' } });
    expect(field().value).toBe('12,');
  });

  it('CT4: without a provider the field reads the canonical text', () => {
    expect(mount(undefined, { amount: 1250, currency: 'USD' }).field().value).toBe('12.50');
  });
});
