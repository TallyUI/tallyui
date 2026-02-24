import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Stack } from 'expo-router';

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
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Setting up {connector.name} database...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Error: {error}</Text>
      </View>
    );
  }

  return (
    <ConnectorProvider connector={connector}>
      <FlatList
        data={products}
        keyExtractor={(item) => traits.getId(item)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.productCard}>
            <ProductImage doc={item} size={60} />
            <View style={styles.productInfo}>
              <ProductTitle doc={item} style={styles.productName} numberOfLines={1} />
              <ProductPrice doc={item} style={styles.productPrice} />
              <Text style={styles.productMeta}>
                SKU: {traits.getSku(item) ?? '—'} · {traits.getStockStatus(item)}
              </Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No products found.</Text>
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

      <View style={styles.container}>
        {/* Connector picker */}
        <View style={styles.pickerContainer}>
          <Text style={styles.pickerLabel}>Active Connector:</Text>
          <View style={styles.pickerRow}>
            {connectors.map((c, i) => (
              <Pressable
                key={c.id}
                style={[
                  styles.pickerButton,
                  i === activeIndex && styles.pickerButtonActive,
                ]}
                onPress={() => setActiveIndex(i)}
              >
                <Text
                  style={[
                    styles.pickerButtonText,
                    i === activeIndex && styles.pickerButtonTextActive,
                  ]}
                >
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Info box */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Same {'<ProductTitle>'}, {'<ProductPrice>'}, and {'<ProductImage>'} components.{'\n'}
            Different data shape underneath.{'\n'}
            WooCommerce uses <Text style={styles.code}>name</Text>, Medusa uses <Text style={styles.code}>title</Text>.{'\n'}
            The trait layer handles the mapping.
          </Text>
        </View>

        {/* Product list — re-mounts when connector changes */}
        <ProductList key={activeConnector.id} connector={activeConnector} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  pickerContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  pickerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pickerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pickerButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  pickerButtonActive: {
    backgroundColor: '#6366f1',
  },
  pickerButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  pickerButtonTextActive: {
    color: '#ffffff',
  },
  infoBox: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 12,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  infoText: {
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 20,
  },
  code: {
    fontFamily: 'monospace',
    fontWeight: '700',
    backgroundColor: '#dbeafe',
    fontSize: 12,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
  },
  list: {
    padding: 16,
    gap: 8,
  },
  productCard: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  productInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  productPrice: {
    fontSize: 15,
    fontWeight: '500',
    color: '#059669',
  },
  productMeta: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 14,
    marginTop: 40,
  },
});
