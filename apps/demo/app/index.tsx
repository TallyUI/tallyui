import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Link, Stack } from 'expo-router';

import { cn } from '@tallyui/theme';
import { ConnectorProvider } from '@tallyui/core';
import { ProductGrid, ProductCard, Switch } from '@tallyui/components';
import { woocommerceConnector } from '@tallyui/connector-woocommerce';
import { medusaConnector } from '@tallyui/connector-medusa';
import { stockOverlay$, stockOverlayAsOf$ } from '@tallyui/pos';
import type { TallyConnector } from '@tallyui/core';

import { useDemoDatabase } from '../lib/use-demo-database';
import { PRIMARY } from '../lib/theme-colors';

const connectors = [woocommerceConnector, medusaConnector];

/**
 * Product list component — renders inside a ConnectorProvider
 * so all Tally UI components pick up the right traits automatically.
 */
function ProductList({ connector }: { connector: TallyConnector }) {
  const { db, products, loading, error } = useDemoDatabase(connector);
  const [overlay, setOverlay] = useState<Map<string, unknown>>();
  const [asOf, setAsOf] = useState<string>();
  const [showUnsellable, setShowUnsellable] = useState(false);

  // The demo starts no reconcile runner, so the overlay stays empty and
  // stock falls back to the product documents.
  useEffect(() => {
    const collection = db?.stock_levels;
    if (!collection) return;
    const subs = [stockOverlay$(collection).subscribe(setOverlay), stockOverlayAsOf$(collection).subscribe(setAsOf)];
    return () => subs.forEach((sub) => sub.unsubscribe());
  }, [db]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center p-5">
        <ActivityIndicator size="large" color={PRIMARY} />
        <Text className="mt-3 text-sm text-muted-foreground">Setting up {connector.name} database...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center p-5">
        <Text className="text-sm text-destructive">Error: {error}</Text>
      </View>
    );
  }

  return (
    <ConnectorProvider connector={connector} stockOverlay={overlay} stockOverlayAsOf={asOf}>
      <View className="flex-row items-center justify-between px-4 pb-2">
        <Text className="text-[13px] text-muted-foreground">Show products this channel doesn't sell</Text>
        <Switch checked={showUnsellable} onCheckedChange={setShowUnsellable} />
      </View>
      <ProductGrid
        items={products}
        showUnsellable={showUnsellable}
        className="px-2"
        renderItem={(item) => <ProductCard doc={item} />}
        emptyState={<Text className="mt-10 text-center text-sm text-muted-foreground">No products found.</Text>}
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
          <Text className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
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
