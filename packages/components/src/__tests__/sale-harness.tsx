// Shared harness for the sale/ component tests (TV6a): a real useSale under a real TaxProvider,
// the same shape as TV5's packages/pos/src/sale/use-sale.test.tsx and medusapos's sale/discount
// screen tests, but rendering the lifted Cart/CartBar/Tender/DiscountForm instead of a mocked one.
import type { ReactNode } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { medusaConnector } from '@tallyui/connector-medusa';
import { TaxProvider, taxProviderProps, useSale, catalogueEntries } from '@tallyui/pos';
import type { StoreSettings as PricingSettings, ServerCapabilities } from '@tallyui/core';

export const traits = medusaConnector.traits.product;
export const pricing: PricingSettings = { currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 250000 } };
// A single variant, so line names read "Shirt" (a second variant would add " · Blue"): matches medusapos's discount.test.tsx.
const [blue] = catalogueEntries(
  [{ id: 'shirt', title: 'Shirt', status: 'published', variants: [{ id: 'blue', title: 'Blue', sku: 'BLUE', prices: [{ amount: 12.5, currency_code: 'eur' }] }] }],
  traits,
);
export { blue };

export let sale: ReturnType<typeof useSale>;
function Inner({ settings, capabilities, children }: {
  settings: PricingSettings; capabilities?: ServerCapabilities; children: (sale: ReturnType<typeof useSale>) => ReactNode;
}) {
  sale = useSale(settings, { registerId: 'register-1', cashierRef: 'cashier', capabilities });
  return <>{children(sale)}</>;
}
export function SaleHarness({ settings = pricing, capabilities, children }: {
  settings?: PricingSettings; capabilities?: ServerCapabilities; children: (sale: ReturnType<typeof useSale>) => ReactNode;
}) {
  return <TaxProvider {...taxProviderProps(settings)}><Inner settings={settings} capabilities={capabilities}>{children}</Inner></TaxProvider>;
}

export const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
/**
 * Opens a discount form, picks Percent/Amount, types a value, and applies it. `opener` is
 * clicked by its text, not its role: the per-line "Discount" action (CartLineActions, an
 * existing component TV6a doesn't touch) renders without accessibilityRole="button".
 */
export function discount(opener: string, type: 'Percent' | 'Amount', value: string) {
  fireEvent.click(screen.getByText(opener));
  click(type);
  fireEvent.change(screen.getByRole('textbox', { name: 'Discount value' }), { target: { value } });
  click('Apply');
}
export const totals = ({ subtotalMinor, discountMinor, taxMinor, totalMinor }: ReturnType<typeof useSale>['order']) =>
  ({ subtotalMinor, discountMinor, taxMinor, totalMinor });
