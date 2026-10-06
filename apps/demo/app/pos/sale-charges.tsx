import { Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Cart, Receipt, Tender } from '@tallyui/components';
import { medusaConnector } from '@tallyui/connector-medusa';
import { TaxProvider, catalogueEntries, taxProviderProps, useSale } from '@tallyui/pos';
import type { ServerCapabilities, StoreSettings } from '@tallyui/core';

// A real sale under a real TaxProvider, as packages/components' sale-harness builds one: EUR, prices excluding tax,
// 25% by default and 10% for the "Reduced rate" class the charge form offers.
const traits = medusaConnector.traits.product;
const settings: StoreSettings = {
  currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 250000, 'reduced-rate': 100000 },
};
const taxClasses = [{ id: 'reduced-rate', label: 'Reduced rate' }];
// Single-variant products, so each line reads as the product's own title.
const entries = catalogueEntries([
  { id: 'shirt', title: 'Shirt', status: 'published', variants: [{ id: 'shirt-blue', title: 'Blue', sku: 'SHIRT', prices: [{ amount: 12.5, currency_code: 'eur' }] }] },
  { id: 'mug', title: 'Mug', status: 'published', variants: [{ id: 'mug-white', title: 'White', sku: 'MUG', prices: [{ amount: 8, currency_code: 'eur' }] }] },
], traits);

function Sale({ capabilities }: { capabilities: ServerCapabilities }) {
  const sale = useSale(settings, { registerId: 'demo-register', cashierRef: 'demo-cashier', capabilities });
  const { stage } = sale;
  if (stage.kind === 'receipt') {
    return <ScrollView testID="sale-receipt" className="flex-1">
      <Receipt order={stage.order} posOrder={stage.posOrder} store={{ name: 'Demo store' }} cashier="Demo cashier"
        registerId="demo-register" newSale={sale.newSale} />
    </ScrollView>;
  }
  if (stage.kind === 'tender') return <ScrollView className="flex-1"><Tender sale={sale} /></ScrollView>;
  return <View className="flex-1">
    <View className="flex-row flex-wrap gap-2 p-3">
      {entries.map((entry) => <Pressable key={entry.variant.id} accessibilityRole="button"
        accessibilityLabel={`Add ${traits.getName(entry.product)}`} onPress={() => sale.add(entry, traits)}
        className="rounded-md border border-border bg-card px-4 py-2 min-h-11 justify-center">
        <Text className="text-foreground">Add {traits.getName(entry.product)}</Text>
      </Pressable>)}
    </View>
    <Cart sale={sale} taxClasses={taxClasses} />
  </View>;
}

/** `?v=4` is a store on order.create 4, which takes no fees, shipping or custom lines: the Cart offers no "Add charge". */
export default function SaleChargesScreen() {
  const { v } = useLocalSearchParams<{ v?: string }>();
  const orderCreate = v === '4' ? 4 : 5;
  return (
    <View className="flex-1 bg-background" testID="sale-charges-screen">
      <Stack.Screen options={{ title: 'Cart charges' }} />
      <TaxProvider {...taxProviderProps(settings)}>
        <Sale key={orderCreate} capabilities={{ orderCreate, lineTax: { none: true, classes: true } }} />
      </TaxProvider>
    </View>
  );
}
