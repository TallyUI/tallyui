// The phone sale screen (N3): v2's Products / Cart bottom tabs, both panes mounted, the cart's count on its tab.
import { Stack, useLocalSearchParams } from 'expo-router';
import { Cart, Catalogue, POSLayout, ScaleProvider } from '@tallyui/components';
import { medusaConnector } from '@tallyui/connector-medusa';
import { ConnectorProvider, type StoreSettings } from '@tallyui/core';
import { TaxProvider, taxProviderProps, useSale } from '@tallyui/pos';

const traits = medusaConnector.traits.product;
const settings: StoreSettings = {
  currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 250000, 'reduced-rate': 100000 },
};
const products = [
  { id: 'shirt', title: 'Shirt', status: 'published', variants: [{ id: 'shirt-blue', title: 'Blue', sku: 'SHIRT', prices: [{ amount: 12.5, currency_code: 'eur' }] }] },
  { id: 'mug', title: 'Mug', status: 'published', variants: [{ id: 'mug-white', title: 'White', sku: 'MUG', prices: [{ amount: 8, currency_code: 'eur' }] }] },
];

function Sale() {
  const sale = useSale(settings, { registerId: 'demo-register', cashierRef: 'demo-cashier', capabilities: { orderCreate: 5, lineTax: { none: true, classes: true } } });
  const cartCount = sale.order.lineItems.reduce((sum, line) => sum + line.quantity, 0);
  return <>
    <Stack.Screen options={{ title: 'Phone sale' }} />
    <POSLayout layout="stacked" tabBar="bottom" cartCount={cartCount} cartSlot={<Cart sale={sale} />}
      browseSlot={<Catalogue products={products} traits={traits} currency="EUR" lastSyncedAt={null} statusText="2 products"
        onSelect={(entry) => sale.add(entry, traits)} cartLines={sale.order.lineItems} />} />
  </>;
}

export default function PhoneSaleScreen() {
  const { scale: param } = useLocalSearchParams<{ scale?: string }>();
  const scale = (['compact', 'regular', 'spacious'] as const).find((step) => step === param);
  return (
    <ConnectorProvider connector={medusaConnector}>
      <TaxProvider {...taxProviderProps(settings)}>
        {scale ? <ScaleProvider scale={scale}><Sale /></ScaleProvider> : <Sale />}
      </TaxProvider>
    </ConnectorProvider>
  );
}
