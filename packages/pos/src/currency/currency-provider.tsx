import { createContext, useContext, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { formatMoney, type Money, type MoneyFormat } from '@tallyui/core';

interface CurrencyContext {
  currencyCode: string;
  locale?: string;
  format?: MoneyFormat;
}

const CurrencyCtx = createContext<CurrencyContext | null>(null);

export interface CurrencyProviderProps {
  currencyCode: string;
  locale?: string;
  /** The store's own money format; without it, money reads as Intl formats it for `locale`. */
  format?: MoneyFormat;
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
      formatMoney(money, locale, format) ?? `${money.amount} ${money.currency}`,
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
