// The v2 search row proof: the view toggle and the app's own control beside the search (v2's PageBar children).
import { useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { AddedToCartToast, type AddedToCartEvent, Cart, Catalogue } from '@tallyui/components';
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
  // v2's phone boundary (lib/device.ts:15-24): no cart column, so a phone-width shot shows the catalogue.
  const { width, height } = useWindowDimensions();
  const phone = width < 768 || height < 480;
  // `?loading=1`: the first pull still running, an empty catalogue drawn as v2's skeleton (grid tiles or table rows).
  const loading = useLocalSearchParams<{ loading?: string }>().loading === '1';
  const [added, setAdded] = useState<AddedToCartEvent | null>(null);
  return <View className="flex-1 flex-row bg-background" testID="catalogue-search-row-screen">
    <Stack.Screen options={{ title: 'Catalogue search row' }} />
    <View className="flex-1">
      <Catalogue products={loading ? [] : products} loading={loading || undefined} traits={traits} currency="EUR" lastSyncedAt={null} showFilterBar showViewToggle statusText={loading ? "Syncing products" : "2 products"}
        onSelect={(entry) => {
          sale.add(entry, traits);
          setAdded((prev) => ({ key: (Number(prev?.key) || 0) + 1, name: traits.getName(entry.product) }));
        }} cartLines={sale.order.lineItems}
        searchAccessory={<Pressable testID="demo-product-settings" accessibilityRole="button" accessibilityLabel="Product settings" className="rounded-md border border-border bg-card px-3 py-2">
          <Text className="text-sm text-foreground">Settings</Text>
        </Pressable>} />
    </View>
    {phone ? null : <View className="w-96 border-l border-border"><Cart sale={sale} /></View>}
    <AddedToCartToast added={added} />
  </View>;
}

export default function CatalogueSearchRowScreen() {
  return (
    <ConnectorProvider connector={medusaConnector}>
      <TaxProvider {...taxProviderProps(settings)}>
        <Sale />
      </TaxProvider>
    </ConnectorProvider>
  );
}
