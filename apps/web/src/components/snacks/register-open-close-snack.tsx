'use client';

import { ExpoSnack } from '../expo-snack';
import { createPropsSnackFiles, propsSnackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { RegisterOpenClose, CashCountInput } from '@tallyui/components';

export default function Demo() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [countedTotal, setCountedTotal] = React.useState(0);
  const [notes, setNotes] = React.useState('');

  return (
    <View style={styles.container}>
      <RegisterOpenClose
        isOpen={isOpen}
        onOpen={() => setIsOpen(true)}
        onClose={() => setIsOpen(false)}
        expectedBalance={isOpen ? 500.00 : undefined}
        cashCountSlot={<CashCountInput onChangeTotal={setCountedTotal} />}
        notesSlot={
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes"
            multiline
            accessibilityLabel="Register notes"
            style={styles.notes}
          />
        }
      />
      <View style={styles.output}>
        <Text style={styles.label}>Register state:</Text>
        <Text style={styles.value}>{isOpen ? 'Open' : 'Closed'}</Text>
        <Text style={styles.label}>Counted cash:</Text>
        <Text style={styles.value}>${'$'}{countedTotal.toFixed(2)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa', gap: 12 },
  notes: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12 },
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
