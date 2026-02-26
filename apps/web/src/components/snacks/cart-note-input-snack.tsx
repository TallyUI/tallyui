'use client';

import { ExpoSnack } from '../expo-snack';
import { createPropsSnackFiles, propsSnackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CartNoteInput } from '@tallyui/components';

export default function Demo() {
  const [note1, setNote1] = React.useState('');
  const [note2, setNote2] = React.useState('Gift wrap this order please');

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>Empty (collapsed)</Text>
        <CartNoteInput value={note1} onChangeText={setNote1} />
        <Text style={styles.value}>Note: {note1 || '(empty)'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Pre-filled (expanded)</Text>
        <CartNoteInput value={note2} onChangeText={setNote2} />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Custom placeholder</Text>
        <CartNoteInput value="" onChangeText={() => {}} placeholder="Special instructions..." />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 12, gap: 8 },
  label: { fontSize: 12, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' },
  value: { fontSize: 14, color: '#374151' },
});`;

export function CartNoteInputDemo() {
  return (
    <ExpoSnack
      files={createPropsSnackFiles(demoCode)}
      dependencies={propsSnackDependencies}
      name="CartNoteInput"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
