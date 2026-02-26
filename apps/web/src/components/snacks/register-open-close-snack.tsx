'use client';

import { ExpoSnack } from '../expo-snack';
import { createPropsSnackFiles, propsSnackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RegisterOpenClose } from '@tallyui/components';

export default function Demo() {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <View style={styles.container}>
      <RegisterOpenClose
        isOpen={isOpen}
        onOpen={() => setIsOpen(true)}
        onClose={() => setIsOpen(false)}
        expectedBalance={isOpen ? 500.00 : undefined}
        cashCountSlot={
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Cash count input goes here</Text>
          </View>
        }
        notesSlot={
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Notes field goes here</Text>
          </View>
        }
      />
      <View style={styles.output}>
        <Text style={styles.label}>Register state:</Text>
        <Text style={styles.value}>{isOpen ? 'Open' : 'Closed'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa', gap: 12 },
  placeholder: { backgroundColor: '#f3f4f6', borderRadius: 8, padding: 16, alignItems: 'center' },
  placeholderText: { fontSize: 12, color: '#9ca3af' },
  output: { backgroundColor: '#fff', borderRadius: 8, padding: 12, marginHorizontal: 16, gap: 4 },
  label: { fontSize: 12, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' },
  value: { fontSize: 14, color: '#374151' },
});`;

export function RegisterOpenCloseDemo() {
  return (
    <ExpoSnack
      files={createPropsSnackFiles(demoCode)}
      dependencies={propsSnackDependencies}
      name="RegisterOpenClose"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
