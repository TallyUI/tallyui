import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { currencySymbol, formatMoney, type MoneyFormat } from '../money';
import type { Money } from '../types/money';

interface MoneyFormatContextValue { locale?: string; format?: MoneyFormat }

const MoneyFormatContext = createContext<MoneyFormatContextValue>({});

export interface MoneyFormatProviderProps {
  /** The store's locale for Intl; a component's own `locale` prop wins over it. */
  locale?: string;
  /** The store's money format (position, separators, decimals, symbol). */
  format?: MoneyFormat;
  children: ReactNode;
}

/** Hands a store's locale and money format to every `useFormatMoney` / `useCurrencySymbol` below it. */
export function MoneyFormatProvider({ locale, format, children }: MoneyFormatProviderProps) {
  const value = useMemo(() => ({ locale, format }), [locale, format]);
  return <MoneyFormatContext.Provider value={value}>{children}</MoneyFormatContext.Provider>;
}

/** The nearest provider's store money format; `undefined` outside a provider or when it has none. */
export function useMoneyFormat(): MoneyFormat | undefined {
  return useContext(MoneyFormatContext).format;
}

/**
 * `formatMoney` with the nearest provider's locale and store format. An explicit `locale` wins over the provider's.
 * Outside a provider it is exactly `formatMoney(money, locale)`.
 */
export function useFormatMoney(): (money: Money, locale?: string) => string | undefined {
  const { locale: storeLocale, format } = useContext(MoneyFormatContext);
  return useCallback(
    (money: Money, locale?: string) => formatMoney(money, locale ?? storeLocale, format),
    [storeLocale, format],
  );
}

/**
 * The symbol to show beside a money input: the store format's `symbol` when set, else `currencySymbol(currency, locale)`.
 * Outside a provider it is exactly `currencySymbol(currency, locale)`.
 */
export function useCurrencySymbol(): (currency: string, locale?: string) => string {
  const { locale: storeLocale, format } = useContext(MoneyFormatContext);
  return useCallback(
    (currency: string, locale?: string) => format?.symbol ?? currencySymbol(currency, locale ?? storeLocale),
    [storeLocale, format],
  );
}
