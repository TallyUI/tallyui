import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Link, Stack } from 'expo-router';

import { cn } from '@tallyui/theme';
import { ConnectorProvider, useProductTraits } from '@tallyui/core';
import { ProductTitle, ProductPrice, ProductImage } from '@tallyui/components';
import { woocommerceConnector } from '@tallyui/connector-woocommerce';
import { medusaConnector } from '@tallyui/connector-medusa';
import type { TallyConnector } from '@tallyui/core';

import { useDemoDatabase } from '../lib/use-demo-database';

const connectors = [woocommerceConnector, medusaConnector];

/**
 * Product list component — renders inside a ConnectorProvider
 * so all Tally UI components pick up the right traits automatically.
 */
function ProductList({ connector }: { connector: TallyConnector }) {
  const { db, products, loading, error } = useDemoDatabase(connector);
  const traits = connector.traits.product;

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center p-5">
        <ActivityIndicator size="large" color="#6366f1" />
        <Text className="mt-3 text-sm text-muted">Setting up {connector.name} database...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center p-5">
        <Text className="text-sm text-danger">Error: {error}</Text>
      </View>
    );
  }

  return (
    <ConnectorProvider connector={connector}>
      <FlatList
        data={products}
        keyExtractor={(item) => traits.getId(item)}
        contentContainerClassName="gap-2 p-4"
        renderItem={({ item }) => (
          <View className="flex-row gap-3 rounded-lg bg-surface p-3 shadow-sm">
            <ProductImage doc={item} size={60} />
            <View className="flex-1 justify-center gap-0.5">
              <ProductTitle doc={item} className="text-base font-semibold" numberOfLines={1} />
              <ProductPrice doc={item} className="text-[15px] font-medium" />
              <Text className="mt-0.5 text-xs text-muted">
                SKU: {traits.getSku(item) ?? '—'} · {traits.getStockStatus(item)}
              </Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text className="mt-10 text-center text-sm text-muted">No products found.</Text>
        }
      />
    </ConnectorProvider>
  );
}

/**
 * Main demo screen.
 * Toggle between connectors to see the same components render data
 * from different API shapes.
 */
export default function DemoScreen() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeConnector = connectors[activeIndex];

  return (
    <>
      <Stack.Screen options={{ title: 'Tally UI Demo' }} />

      <View className="flex-1 bg-bg">
        {/* Test screen links */}
        <View className="mx-4 mt-4 gap-2">
          <Link href="/primitives" asChild>
            <Pressable className="rounded-lg bg-primary px-4 py-3">
              <Text className="text-center text-[15px] font-semibold text-primary-foreground">
                Primitives Test Screens
              </Text>
            </Pressable>
          </Link>
          <Link href="/ui" asChild>
            <Pressable className="rounded-lg bg-secondary px-4 py-3">
              <Text className="text-center text-[15px] font-semibold text-secondary-foreground">
                UI Components
              </Text>
            </Pressable>
          </Link>
          <Link href="/pos" asChild>
            <Pressable className="rounded-lg bg-secondary px-4 py-3">
              <Text className="text-center text-[15px] font-semibold text-secondary-foreground">
                POS Components
              </Text>
            </Pressable>
          </Link>
        </View>

        {/* Connector picker */}
        <View className="px-4 pb-2 pt-4">
          <Text className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
            Active Connector:
          </Text>
          <View className="flex-row gap-2">
            {connectors.map((c, i) => (
              <Pressable
                key={c.id}
                className={cn(
                  'rounded-lg px-4 py-2.5',
                  i === activeIndex ? 'bg-primary' : 'bg-border'
                )}
                onPress={() => setActiveIndex(i)}
              >
                <Text
                  className={cn(
                    'text-[15px] font-semibold',
                    i === activeIndex ? 'text-primary-foreground' : 'text-foreground'
                  )}
                >
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Info box */}
        <View className="mx-4 my-2 rounded-lg border border-info/30 bg-info/10 p-3">
          <Text className="text-[13px] leading-5 text-info">
            Same {'<ProductTitle>'}, {'<ProductPrice>'}, and {'<ProductImage>'} components.{'\n'}
            Different data shape underneath.{'\n'}
            WooCommerce uses <Text className="font-mono text-xs font-bold bg-info/20">name</Text>, Medusa uses <Text className="font-mono text-xs font-bold bg-info/20">title</Text>.{'\n'}
            The trait layer handles the mapping.
          </Text>
        </View>

        {/* Product list — re-mounts when connector changes */}
        <ProductList key={activeConnector.id} connector={activeConnector} />
      </View>
    </>
  );
}
