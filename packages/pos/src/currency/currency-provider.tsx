import { createContext, useContext, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { formatCurrency } from './format-currency';

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

export function useCurrencyFormatter(): (amount: number) => string {
  const ctx = useContext(CurrencyCtx);
  if (!ctx) {
    throw new Error('useCurrencyFormatter() must be used within a <CurrencyProvider>');
  }
  return useCallback(
    (amount: number) => formatCurrency(amount, ctx.currencyCode, ctx.locale),
    [ctx.currencyCode, ctx.locale],
  );
}
