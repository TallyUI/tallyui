// The term pills proof: a pill per term group (here Brand and Colour, demo-local terms), each a single-select search.
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { Catalogue } from '@tallyui/components';
import { medusaConnector } from '@tallyui/connector-medusa';
import { ConnectorProvider, type ProductTerm, type StoreSettings } from '@tallyui/core';
import { TaxProvider, taxProviderProps } from '@tallyui/pos';

const settings: StoreSettings = {
  currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 250000, 'reduced-rate': 100000 },
};
const products = [
  { id: 'shirt', title: 'Shirt', status: 'published', variants: [{ id: 'shirt-one', title: 'One size', sku: 'SHIRT', prices: [{ amount: 12.5, currency_code: 'eur' }] }] },
  { id: 'mug', title: 'Mug', status: 'published', variants: [{ id: 'mug-one', title: 'One size', sku: 'MUG', prices: [{ amount: 8, currency_code: 'eur' }] }] },
  { id: 'cap', title: 'Cap', status: 'published', variants: [{ id: 'cap-one', title: 'One size', sku: 'CAP', prices: [{ amount: 10, currency_code: 'eur' }] }] },
  { id: 'tote', title: 'Tote', status: 'published', variants: [{ id: 'tote-one', title: 'One size', sku: 'TOTE', prices: [{ amount: 6, currency_code: 'eur' }] }] },
];
const brand = (id: string, name: string): ProductTerm => ({ group: 'brand', groupName: 'Brand', id, name });
const colour = (id: string, name: string): ProductTerm => ({ group: 'colour', groupName: 'Colour', id, name });
const TERMS: Record<string, ProductTerm[]> = {
  shirt: [brand('acme', 'Acme'), colour('blue', 'Blue')],
  mug: [brand('acme', 'Acme'), colour('white', 'White')],
  cap: [brand('zest', 'Zest'), colour('blue', 'Blue')],
};
const traits = { ...medusaConnector.traits.product, getTerms: (doc: { id: string }) => TERMS[doc.id] ?? [] };

export default function CatalogueTermsScreen() {
  return (
    <ConnectorProvider connector={medusaConnector}>
      <TaxProvider {...taxProviderProps(settings)}>
        <View className="flex-1 bg-background" testID="catalogue-terms-screen">
          <Stack.Screen options={{ title: 'Catalogue terms' }} />
          <Catalogue products={products} traits={traits} currency="EUR" lastSyncedAt={null} showFilterBar termPills onSelect={() => {}} />
        </View>
      </TaxProvider>
    </ConnectorProvider>
  );
}
