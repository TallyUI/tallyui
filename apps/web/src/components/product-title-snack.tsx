'use client';

import { ExpoSnack } from './expo-snack';

const MOCK_API = 'https://mock.tallyui.com';

const snackCode = `import React, { createContext, useContext, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';

const MOCK_API = '${MOCK_API}';

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
  key: 'woo',
  label: 'WooCommerce',
  traits: {
    product: {
      getName: (doc) => doc.name,
      getPrice: (doc) => doc.price,
    },
  },
  fetchProducts: () =>
    fetch(MOCK_API + '/woocommerce/wp-json/wc/v3/products?per_page=3')
      .then((r) => r.json()),
};

// Medusa connector traits
const medusaConnector = {
  key: 'medusa',
  label: 'Medusa',
  traits: {
    product: {
      getName: (doc) => doc.title,
      getPrice: (doc) => (doc.variants[0].prices[0].amount / 100).toFixed(2),
    },
  },
  fetchProducts: () =>
    fetch(MOCK_API + '/medusa/admin/products?limit=3')
      .then((r) => r.json())
      .then((data) => data.products),
};

const connectors = [wooConnector, medusaConnector];

export default function App() {
  const [active, setActive] = useState(0);
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(true);

  const connector = connectors[active];

  useEffect(() => {
    if (cache[connector.key]) { setLoading(false); return; }
    setLoading(true);
    connector.fetchProducts()
      .then((items) => setCache((prev) => ({ ...prev, [connector.key]: items })))
      .finally(() => setLoading(false));
  }, [active]);

  const products = cache[connector.key] || [];

  return (
    <ConnectorContext.Provider value={connector}>
      <View style={styles.container}>
        <Text style={styles.label}>Active Connector:</Text>
        <View style={styles.row}>
          {connectors.map((c, i) => (
            <Pressable key={c.key} style={[styles.btn, active === i && styles.active]} onPress={() => setActive(i)}>
              <Text style={[styles.btnText, active === i && styles.activeText]}>{c.label}</Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color="#6366f1" size="large" />
        ) : (
          <View style={{ gap: 12 }}>
            {products.map((product, i) => (
              <View key={i} style={styles.card}>
                <ProductTitle doc={product} />
                <ProductPrice doc={product} />
              </View>
            ))}
          </View>
        )}

        <Text style={styles.hint}>
          Same components, different API shapes.{String.fromCharCode(10)}
          Fetched live from mock.tallyui.com
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
