// WCPOS v2's Products screen read columns (productsScreenColumns) on five Medusa products: tracked, out of stock,
// untracked, on sale and with several variants.
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { ProductTable, useProductsScreenColumns } from '@tallyui/components';
import { medusaConnector } from '@tallyui/connector-medusa';
import { ConnectorProvider } from '@tallyui/core';

// Inline thumbnails, so the page needs no network.
const square = (fill: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="${fill}"/></svg>`)}`;
const price = (amount: number) => [{ amount, currency_code: 'eur' }];
const tracked = (quantity: number) => ({ manage_inventory: true, inventory_quantity: quantity });
const products = [
  { id: 'beanie', title: 'Wool Beanie', status: 'published', thumbnail: square('#2563eb'), categories: [{ id: 'hats', name: 'Hats' }],
    variants: [{ id: 'beanie-grey', title: 'Grey', sku: 'BEANIE', prices: price(18), ...tracked(52) }] },
  { id: 'scarf', title: 'Cashmere Scarf', status: 'published', categories: [{ id: 'accessories', name: 'Accessories' }],
    variants: [{ id: 'scarf-red', title: 'Red', sku: 'SCARF', prices: price(65), ...tracked(0) }] },
  { id: 'gift-card', title: 'Gift Card', status: 'published', thumbnail: square('#9333ea'),
    variants: [{ id: 'gift-card-25', title: '25', sku: 'GIFT', prices: price(25), manage_inventory: false }] },
  { id: 'mug', title: 'Enamel Mug', status: 'published', thumbnail: square('#16a34a'), categories: [{ id: 'kitchen', name: 'Kitchen' }, { id: 'gifts', name: 'Gifts' }],
    variants: [{ id: 'mug-white', title: 'White', sku: 'MUG', ...tracked(14), calculated_price: {
      currency_code: 'eur', original_amount: 12, calculated_amount: 9, calculated_price: { price_list_type: 'sale' } } }] },
  { id: 'tee', title: 'Organic Tee', status: 'published', thumbnail: square('#ea580c'), categories: [{ id: 'clothing', name: 'Clothing' }],
    variants: ['XS', 'S', 'M', 'L', 'XL'].map((size, i) => ({ id: 'tee-' + size, title: size, sku: 'TEE-' + size, prices: price(25), ...tracked(i * 3) })) },
];

function Table() {
  return <ProductTable items={products} columns={useProductsScreenColumns()} />;
}

export default function ProductsScreen() {
  return (
    <ConnectorProvider connector={medusaConnector}>
      <View className="flex-1 bg-background" testID="products-screen">
        <Stack.Screen options={{ title: 'Products screen' }} />
        <Table />
      </View>
    </ConnectorProvider>
  );
}
