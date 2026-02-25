'use client';

import { ExpoSnack } from './expo-snack';

const snackCode = `import React, { createContext, useContext } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';

// Simplified trait system (in real usage, this comes from @tallyui/core)
const ConnectorContext = createContext(null);
const useProductTraits = () => useContext(ConnectorContext).traits.product;

function ProductTitle({ doc, style }) {
  const { getName } = useProductTraits();
  return <Text style={[styles.title, style]}>{getName(doc)}</Text>;
}

function ProductPrice({ doc, style }) {
  const { getPrice } = useProductTraits();
  const price = getPrice(doc);
  return <Text style={[styles.price, style]}>\${price}</Text>;
}

// WooCommerce connector traits
const wooConnector = {
  traits: {
    product: {
      getName: (doc) => doc.name,
      getPrice: (doc) => doc.price,
    },
  },
};

// Medusa connector traits
const medusaConnector = {
  traits: {
    product: {
      getName: (doc) => doc.title,
      getPrice: (doc) => (doc.variants[0].prices[0].amount / 100).toFixed(2),
    },
  },
};

// Same product, different API shapes
const wooProduct = { name: 'Espresso Machine Pro', price: '599.99' };
const medusaProduct = { title: 'Espresso Machine Pro', variants: [{ prices: [{ amount: 59999 }] }] };

export default function App() {
  const [isWoo, setIsWoo] = React.useState(true);
  const connector = isWoo ? wooConnector : medusaConnector;
  const product = isWoo ? wooProduct : medusaProduct;

  return (
    <ConnectorContext.Provider value={connector}>
      <View style={styles.container}>
        <Text style={styles.label}>Active Connector:</Text>
        <View style={styles.row}>
          <Pressable style={[styles.btn, isWoo && styles.active]} onPress={() => setIsWoo(true)}>
            <Text style={[styles.btnText, isWoo && styles.activeText]}>WooCommerce</Text>
          </Pressable>
          <Pressable style={[styles.btn, !isWoo && styles.active]} onPress={() => setIsWoo(false)}>
            <Text style={[styles.btnText, !isWoo && styles.activeText]}>Medusa</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <ProductTitle doc={product} />
          <ProductPrice doc={product} />
        </View>

        <Text style={styles.hint}>
          Same components. {isWoo ? 'Reading doc.name + doc.price' : 'Reading doc.title + doc.variants[0].prices[0].amount'}
        </Text>
      </View>
    </ConnectorContext.Provider>
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
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 16, gap: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  title: { fontSize: 18, fontWeight: '600', color: '#111827' },
  price: { fontSize: 16, fontWeight: '500', color: '#059669' },
  hint: { marginTop: 16, fontSize: 12, color: '#9ca3af', textAlign: 'center' },
});`;

/**
 * Pre-built ExpoSnack demo for the ProductTitle component.
 * Separated from MDX to avoid template literal parsing issues.
 */
export function ProductTitleSnack() {
  return (
    <ExpoSnack
      code={snackCode}
      name="ProductTitle Demo"
      platform="web"
      preview={true}
      height="600px"
    />
  );
}
