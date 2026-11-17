// The v2 rows proof: a notice between the filter chips and the products (v2's ListColumn `rows`).
import { Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Cart, Catalogue } from '@tallyui/components';
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
  return <View className="flex-1 flex-row bg-background" testID="catalogue-rows-screen">
    <Stack.Screen options={{ title: 'Catalogue rows' }} />
    <View className="flex-1">
      <Catalogue products={products} traits={traits} currency="EUR" lastSyncedAt={null} showFilterBar
        onSelect={(entry) => sale.add(entry, traits)} cartLines={sale.order.lineItems}
        rowsSlot={<View className="flex-row items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
          <Text className="text-sm text-foreground">Price check only until the register is open.</Text>
        </View>} />
    </View>
    <View className="w-96 border-l border-border"><Cart sale={sale} /></View>
  </View>;
}

export default function CatalogueRowsScreen() {
  return (
    <ConnectorProvider connector={medusaConnector}>
      <TaxProvider {...taxProviderProps(settings)}>
        <Sale />
      </TaxProvider>
    </ConnectorProvider>
  );
}
