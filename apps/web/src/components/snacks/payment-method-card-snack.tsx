'use client';

import { ExpoSnack } from '../expo-snack';
import { snackDependencies } from './snack-wrapper';

const code = `import React from 'react';
import { View, StyleSheet } from 'react-native';
import { PaymentMethodCard } from '@tallyui/components';

export default function App() {
  const [selected, setSelected] = React.useState('cash');

  return (
    <View style={styles.container}>
      <PaymentMethodCard
        label="Cash"
        selected={selected === 'cash'}
        onPress={() => setSelected('cash')}
      />
      <PaymentMethodCard
        label="Credit Card"
        selected={selected === 'card'}
        onPress={() => setSelected('card')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#f8f9fa', gap: 8 },
});`;

export function PaymentMethodCardDemo() {
  return (
    <ExpoSnack
      code={code}
      dependencies={snackDependencies}
      name="PaymentMethodCard"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
