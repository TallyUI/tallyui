import { createContext, useContext, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { formatMoney, type Money } from '@tallyui/core';
import { formatMoneyWith, type CurrencyFormat } from './format-money-with';

interface CurrencyContext {
  currencyCode: string;
  locale?: string;
  format?: CurrencyFormat;
}

const CurrencyCtx = createContext<CurrencyContext | null>(null);

export interface CurrencyProviderProps {
  currencyCode: string;
  locale?: string;
  /** The store's own money format; without it, money reads as Intl formats it for `locale`. */
  format?: CurrencyFormat;
  children: ReactNode;
}

export function CurrencyProvider({ currencyCode, locale, format, children }: CurrencyProviderProps) {
  const value = useMemo(() => ({ currencyCode, locale, format }), [currencyCode, locale, format]);
  return <CurrencyCtx.Provider value={value}>{children}</CurrencyCtx.Provider>;
}

export function useCurrencyFormatter(): (money: Money) => string {
  const ctx = useContext(CurrencyCtx);
  if (!ctx) {
    throw new Error('useCurrencyFormatter() must be used within a <CurrencyProvider>');
  }
  const { locale, format } = ctx;
  return useCallback(
    (money: Money) =>
      (format ? formatMoneyWith(money, format, locale) : formatMoney(money, locale)) ??
      `${money.amount} ${money.currency}`,
    [locale, format],
  );
}

export function useCurrencyCode(): string {
  const ctx = useContext(CurrencyCtx);
  if (!ctx) {
    throw new Error('useCurrencyCode() must be used within a <CurrencyProvider>');
  }
  return ctx.currencyCode;
}
