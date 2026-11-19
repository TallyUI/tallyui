import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MoneyFormatProvider, useCurrencySymbol, useFormatMoney, useMoneyFormat } from '../context/money-format-context';
import { currencySymbol, formatMoney } from '../money';
import type { Money } from '../types/money';

function Probe({ money, locale }: { money: Money; locale?: string }) {
  const format = useFormatMoney();
  const symbol = useCurrencySymbol();
  return <><span data-testid="money">{format(money, locale)}</span><span data-testid="symbol">{symbol(money.currency, locale)}</span></>;
}

describe('MoneyFormatProvider', () => {
  it('uses the existing money formatter and currency symbol outside a provider', () => {
    const money = { amount: 1250, currency: 'CAD' };
    render(<Probe money={money} locale="en" />);
    expect(screen.getByTestId('money').textContent).toBe(formatMoney(money, 'en'));
    expect(screen.getByTestId('symbol').textContent).toBe(currencySymbol('CAD', 'en'));
  });

  it('provides the store format and input symbol', () => {
    render(<MoneyFormatProvider locale="en" format={{ position: 'left', symbol: '$' }}>
      <Probe money={{ amount: 1250, currency: 'CAD' }} />
    </MoneyFormatProvider>);
    expect(screen.getByTestId('money').textContent).toBe('$12.50');
    expect(screen.getByTestId('symbol').textContent).toBe('$');
  });

  it('uses the store locale unless an explicit locale is provided', () => {
    const money = { amount: 123450, currency: 'EUR' };
    const { rerender } = render(<MoneyFormatProvider locale="de-DE"><Probe money={money} /></MoneyFormatProvider>);
    expect(screen.getByTestId('money').textContent).toBe(formatMoney(money, 'de-DE'));
    rerender(<MoneyFormatProvider locale="de-DE"><Probe money={money} locale="en" /></MoneyFormatProvider>);
    expect(screen.getByTestId('money').textContent).toBe(formatMoney(money, 'en'));
  });
});

describe('useMoneyFormat (#672)', () => {
  it('MF1: is undefined outside a provider or without a format, and the provider format inside one', () => {
    let seen: unknown = 'unset';
    function FormatProbe() { seen = useMoneyFormat(); return null; }
    render(<FormatProbe />);
    expect(seen).toBeUndefined();
    seen = 'unset';
    render(<MoneyFormatProvider locale="en"><FormatProbe /></MoneyFormatProvider>);
    expect(seen).toBeUndefined();
    const format = { decimalSeparator: ',', thousandSeparator: '.' };
    render(<MoneyFormatProvider format={format}><FormatProbe /></MoneyFormatProvider>);
    expect(seen).toBe(format);
  });
});
