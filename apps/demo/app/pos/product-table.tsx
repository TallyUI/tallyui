// The v2 product table row: a thumbnail leads each row and a + (or > for variants) ends it, on a real sale; once a product is in the cart its count takes the +'s place.
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { Cart, Catalogue } from '@tallyui/components';
import { medusaConnector } from '@tallyui/connector-medusa';
import { ConnectorProvider, type StoreSettings } from '@tallyui/core';
import { TaxProvider, taxProviderProps, useSale } from '@tallyui/pos';

const traits = medusaConnector.traits.product;
const settings: StoreSettings = {
  currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 250000, 'reduced-rate': 100000 },
};
// Inline thumbnails, so the page needs no network.
const square = (fill: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="${fill}"/></svg>`)}`;
const price = (amount: number) => [{ amount, currency_code: 'eur' }];
const products = [
  { id: 'shirt', title: 'Shirt', status: 'published', thumbnail: square('#2563eb'), variants: [{ id: 'shirt-blue', title: 'Blue', sku: 'SHIRT', prices: price(12.5) }] },
  { id: 'mug', title: 'Mug', status: 'published', variants: [{ id: 'mug-white', title: 'White', sku: 'MUG', prices: price(8) }] },
  { id: 'hoodie', title: 'Hoodie', status: 'published', thumbnail: square('#16a34a'),
    variants: ['S', 'M'].map((size) => ({ id: 'hoodie-' + size, title: size, sku: 'HOODIE-' + size, prices: price(30) })) },
];

function Sale() {
  const sale = useSale(settings, { registerId: 'demo-register', cashierRef: 'demo-cashier', capabilities: { orderCreate: 5, lineTax: { none: true, classes: true } } });
  return <View className="flex-1 flex-row bg-background" testID="product-table-screen">
    <Stack.Screen options={{ title: 'Product table' }} />
    <View className="flex-1">
      <Catalogue products={products} traits={traits} currency="EUR" lastSyncedAt={null} defaultViewState={{ view: 'table' }}
        tableRow={{ thumbnail: true, addButton: true }} onSelect={(entry) => sale.add(entry, traits)} cartLines={sale.order.lineItems} />
    </View>
    <View className="w-96 border-l border-border" testID="product-table-cart"><Cart sale={sale} /></View>
  </View>;
}

export default function ProductTableScreen() {
  return (
    <ConnectorProvider connector={medusaConnector}>
      <TaxProvider {...taxProviderProps(settings)}>
        <Sale />
      </TaxProvider>
    </ConnectorProvider>
  );
}
