import { Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Cart } from '@tallyui/components';
import { medusaConnector } from '@tallyui/connector-medusa';
import { TaxProvider, catalogueEntries, taxProviderProps, useSale } from '@tallyui/pos';
import type { StoreSettings } from '@tallyui/core';

const traits = medusaConnector.traits.product;
const settings: StoreSettings = {
  currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 250000, 'reduced-rate': 100000 },
};
const entries = catalogueEntries([
  { id: 'shirt', title: 'Shirt', status: 'published', variants: [{ id: 'shirt-blue', title: 'Blue', sku: 'SHIRT', prices: [{ amount: 12.5, currency_code: 'eur' }] }] },
], traits);

function Sale() {
  const sale = useSale(settings, { registerId: 'demo-register', cashierRef: 'demo-cashier', capabilities: { orderCreate: 7 } });
  return <View className="flex-1">
    <View className="flex-row flex-wrap gap-2 p-3">
      {entries.map((entry) => <Pressable key={entry.variant.id} accessibilityRole="button"
        accessibilityLabel={`Add ${traits.getName(entry.product)}`} onPress={() => sale.add(entry, traits)}
        className="rounded-md border border-border bg-card px-4 py-2 min-h-11 justify-center">
        <Text className="text-foreground">Add {traits.getName(entry.product)}</Text>
      </Pressable>)}
    </View>
    {/* Checkout is sale-charges' subject; this screen is the note's. */}
    <Cart sale={sale} showTotal={false} checkout={{ onCheckout: () => {} }} noteSheet={{}} />
  </View>;
}

export default function SaleNoteScreen() {
  return (
    <View className="flex-1 bg-background" testID="sale-note-screen">
      <Stack.Screen options={{ title: 'Cart note' }} />
      <TaxProvider {...taxProviderProps(settings)}>
        <Sale />
      </TaxProvider>
    </View>
  );
}
