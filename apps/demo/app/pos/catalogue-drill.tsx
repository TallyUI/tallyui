// v2's "Open in place" variations: a tap on the Tee swaps the grid for its variant tiles, the Tee's own tile first as Back.
import { View, useWindowDimensions } from 'react-native';
import { Stack } from 'expo-router';
import { Cart, Catalogue } from '@tallyui/components';
import { woocommerceConnector, wooProductTraits } from '@tallyui/connector-woocommerce';
import { ConnectorProvider, type StoreSettings } from '@tallyui/core';
import { TaxProvider, taxProviderProps, useSale } from '@tallyui/pos';

const traits = wooProductTraits;
const settings: StoreSettings = { currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 250000 } };
const variation = (id: number, sku: string, price: string, attributes: { name: string; option: string }[]) =>
  ({ id, status: 'publish', sku, regular_price: price, stock_status: 'instock', attributes });
const products = [
  { id: 80, name: 'Tee', type: 'variable', status: 'publish', attributes: [
    { name: 'Size', variation: true, position: 0, options: ['S', 'M', 'L'] },
    { name: 'Colour', variation: true, position: 1, options: ['Red', 'Blue'] },
  ], variation_docs: [
    variation(81, 'TEE-M-RED', '20', [{ name: 'Size', option: 'M' }, { name: 'Colour', option: 'Red' }]),
    variation(82, 'TEE-S-BLUE', '20', [{ name: 'Size', option: 'S' }, { name: 'Colour', option: 'Blue' }]),
    variation(83, 'TEE-L', '22', [{ name: 'Size', option: 'L' }]),
  ] },
  { id: 90, name: 'Mug', type: 'simple', status: 'publish', sku: 'MUG', regular_price: '8', stock_status: 'instock' },
];

function Sale() {
  const sale = useSale(settings, { registerId: 'demo-register', cashierRef: 'demo-cashier', capabilities: { orderCreate: 5, lineTax: { none: true, classes: true } } });
  const phone = useWindowDimensions().width < 768;
  return <View className={phone ? 'flex-1 bg-background' : 'flex-1 flex-row bg-background'} testID="catalogue-drill-screen">
    <Stack.Screen options={{ title: 'Catalogue drill' }} />
    <View className="flex-1">
      <Catalogue products={products} traits={traits} currency="EUR" lastSyncedAt={null} variationsStyle="drill"
        onSelect={(entry) => sale.add(entry, traits)} cartLines={sale.order.lineItems} />
    </View>
    <View testID="catalogue-drill-cart" className={phone ? 'h-72 border-t border-border' : 'w-96 border-l border-border'}><Cart sale={sale} /></View>
  </View>;
}

export default function CatalogueDrillScreen() {
  return <ConnectorProvider connector={woocommerceConnector}><TaxProvider {...taxProviderProps(settings)}><Sale /></TaxProvider></ConnectorProvider>;
}
