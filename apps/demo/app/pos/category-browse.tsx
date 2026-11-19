// The v2 category breadcrumb proof: category tiles that open under the shared crumb. One category's name is long,
// so at 390 px the crumb's place wraps rather than being cut off.
import { View, useWindowDimensions } from 'react-native';
import { Stack } from 'expo-router';
import { Cart, Catalogue } from '@tallyui/components';
import { medusaConnector } from '@tallyui/connector-medusa';
import { ConnectorProvider, type StoreSettings } from '@tallyui/core';
import { TaxProvider, taxProviderProps, useSale } from '@tallyui/pos';

const traits = medusaConnector.traits.product;
const settings: StoreSettings = {
  currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 250000, 'reduced-rate': 100000 },
};
const shirts = { id: 'pcat_shirts', name: 'Shirts' };
const ceramics = { id: 'pcat_ceramics', name: 'Hand-thrown stoneware mugs, jugs and serving bowls from the studio' };
const products = [
  { id: 'shirt', title: 'Shirt', status: 'published', categories: [shirts], variants: [{ id: 'shirt-blue', title: 'Blue', sku: 'SHIRT', prices: [{ amount: 12.5, currency_code: 'eur' }] }] },
  { id: 'mug', title: 'Mug', status: 'published', categories: [ceramics], variants: [{ id: 'mug-white', title: 'White', sku: 'MUG', prices: [{ amount: 8, currency_code: 'eur' }] }] },
  { id: 'jug', title: 'Jug', status: 'published', categories: [ceramics], variants: [{ id: 'jug-grey', title: 'Grey', sku: 'JUG', prices: [{ amount: 18, currency_code: 'eur' }] }] },
];

function Sale() {
  const sale = useSale(settings, { registerId: 'demo-register', cashierRef: 'demo-cashier', capabilities: { orderCreate: 5, lineTax: { none: true, classes: true } } });
  // v2's phone boundary (lib/device.ts:15-24): no cart column, so a phone-width shot shows the catalogue.
  const { width, height } = useWindowDimensions();
  const phone = width < 768 || height < 480;
  return <View className="flex-1 flex-row bg-background" testID="category-browse-screen">
    <Stack.Screen options={{ title: 'Category browse' }} />
    <View className="flex-1">
      <Catalogue products={products} traits={traits} currency="EUR" lastSyncedAt={null} showCategoryNav categoryBrowse="tiles"
        onSelect={(entry) => sale.add(entry, traits)} cartLines={sale.order.lineItems} />
    </View>
    {phone ? null : <View className="w-96 border-l border-border"><Cart sale={sale} /></View>}
  </View>;
}

export default function CategoryBrowseScreen() {
  return (
    <ConnectorProvider connector={medusaConnector}>
      <TaxProvider {...taxProviderProps(settings)}>
        <Sale />
      </TaxProvider>
    </ConnectorProvider>
  );
}
