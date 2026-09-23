import { createContext, useContext, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { formatMoney, type Money } from '@tallyui/core';

interface CurrencyContext {
  currencyCode: string;
  locale?: string;
}

const CurrencyCtx = createContext<CurrencyContext | null>(null);

export interface CurrencyProviderProps {
  currencyCode: string;
  locale?: string;
  children: ReactNode;
}

export function CurrencyProvider({ currencyCode, locale, children }: CurrencyProviderProps) {
  const value = useMemo(() => ({ currencyCode, locale }), [currencyCode, locale]);
  return <CurrencyCtx.Provider value={value}>{children}</CurrencyCtx.Provider>;
}

export function useCurrencyFormatter(): (money: Money) => string {
  const ctx = useContext(CurrencyCtx);
  if (!ctx) {
    throw new Error('useCurrencyFormatter() must be used within a <CurrencyProvider>');
  }
  return useCallback(
    (money: Money) => formatMoney(money, ctx.locale) ?? `${money.amount} ${money.currency}`,
    [ctx.locale],
  );
}

export function useCurrencyCode(): string {
  const ctx = useContext(CurrencyCtx);
  if (!ctx) {
    throw new Error('useCurrencyCode() must be used within a <CurrencyProvider>');
  }
  return ctx.currencyCode;
}
