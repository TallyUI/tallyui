/**
 * Generates Expo Snack `files` prop for component demos.
 *
 * Provides a standard App.js shell with WooCommerce/Medusa connector toggle.
 * Each demo supplies a Demo component that receives { doc, connector } props.
 */
export function createSnackFiles(demoCode: string) {
  const appCode = `import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ConnectorProvider } from '@tallyui/core';
import { woocommerceConnector } from '@tallyui/connector-woocommerce';
import { medusaConnector } from '@tallyui/connector-medusa';
import Demo from './Demo';

const wooDoc = {
  id: 42,
  name: 'Espresso Machine Pro',
  sku: 'ESP-001',
  price: '599.99',
  regular_price: '599.99',
  sale_price: '',
  on_sale: false,
  stock_status: 'instock',
  stock_quantity: 15,
  barcode: '1234567890123',
  images: [{ id: 1, src: 'https://picsum.photos/200', alt: '' }],
  categories: [{ id: 1, name: 'Equipment', slug: 'equipment' }],
};

const medusaDoc = {
  id: 'prod_01H',
  title: 'Commercial Espresso Machine',
  handle: 'commercial-espresso-machine',
  status: 'published',
  thumbnail: 'https://picsum.photos/200',
  description: 'High-end commercial espresso machine.',
  images: [{ id: 'img_01', url: 'https://picsum.photos/200' }],
  categories: [{ id: 'pcat_01', name: 'Equipment' }],
  variants: [{
    id: 'var_01',
    sku: 'MED-ESP-001',
    barcode: '9876543210001',
    inventory_quantity: 8,
    manage_inventory: true,
    allow_backorder: false,
    prices: [{ currency_code: 'usd', amount: 89900 }],
  }],
};

export default function App() {
  const [isWoo, setIsWoo] = React.useState(true);
  const connector = isWoo ? woocommerceConnector : medusaConnector;
  const doc = isWoo ? wooDoc : medusaDoc;

  return (
    <ConnectorProvider connector={connector}>
      <View style={styles.container}>
        <Text style={styles.label}>Connector:</Text>
        <View style={styles.row}>
          <Pressable style={[styles.btn, isWoo && styles.active]} onPress={() => setIsWoo(true)}>
            <Text style={[styles.btnText, isWoo && styles.activeText]}>WooCommerce</Text>
          </Pressable>
          <Pressable style={[styles.btn, !isWoo && styles.active]} onPress={() => setIsWoo(false)}>
            <Text style={[styles.btnText, !isWoo && styles.activeText]}>Medusa</Text>
          </Pressable>
        </View>
        <View style={styles.card}>
          <Demo doc={doc} />
        </View>
      </View>
    </ConnectorProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#f8f9fa' },
  label: { fontSize: 12, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#e5e7eb' },
  active: { backgroundColor: '#6366f1' },
  btnText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  activeText: { color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 16, gap: 8, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
});`;

  return {
    'App.js': { type: 'CODE' as const, contents: appCode },
    'Demo.js': { type: 'CODE' as const, contents: demoCode },
  };
}

/** Standard npm dependencies for all component Snack demos */
export const snackDependencies = [
  '@tallyui/core',
  '@tallyui/components',
  '@tallyui/theme',
  '@tallyui/connector-woocommerce',
  '@tallyui/connector-medusa',
].join(',');

/**
 * Generates Expo Snack files for props-based component demos (no connector toggle).
 *
 * Use this for components that accept plain props rather than RxDB documents.
 */
export function createPropsSnackFiles(demoCode: string) {
  const appCode = `import React from 'react';
import { View, StyleSheet } from 'react-native';
import Demo from './Demo';

export default function App() {
  return (
    <View style={styles.container}>
      <Demo />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#f8f9fa' },
});`;

  return {
    'App.js': { type: 'CODE' as const, contents: appCode },
    'Demo.js': { type: 'CODE' as const, contents: demoCode },
  };
}

/** Standard npm dependencies for props-based Snack demos */
export const propsSnackDependencies = [
  '@tallyui/components',
  '@tallyui/theme',
].join(',');
